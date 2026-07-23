-- ============================================================
-- Atomic inventory sale RPC
--
-- Collapses the previous 3-round-trip sell flow (SELECT product →
-- INSERT sale → UPDATE stock) into a single atomic transaction, and
-- fixes an oversell race: two concurrent sells could each read the same
-- stock level and both succeed. Row-level FOR UPDATE lock prevents that.
--
-- Runs SECURITY DEFINER but re-verifies gym ownership via auth.uid(), so
-- it is safe to expose to the authenticated (anon-key + JWT) client.
--
-- Idempotent: safe to re-run (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION sell_inventory_item(
  p_inventory_id UUID,
  p_quantity     INTEGER,
  p_unit_price   NUMERIC,
  p_payment_mode TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product  inventory%ROWTYPE;
  v_price    NUMERIC;
  v_total    NUMERIC;
  v_mode     TEXT;
  v_sale_id  UUID;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  v_mode := CASE WHEN p_payment_mode IN ('cash', 'upi', 'card') THEN p_payment_mode ELSE 'cash' END;

  -- Lock the product row so concurrent sells serialize and cannot oversell.
  SELECT * INTO v_product FROM inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  -- Re-verify ownership inside the definer function.
  IF NOT EXISTS (SELECT 1 FROM gyms WHERE id = v_product.gym_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'ACCESS_DENIED';
  END IF;

  IF v_product.initial_stock < p_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_product.initial_stock;
  END IF;

  v_price := COALESCE(p_unit_price, v_product.selling_price);
  v_total := v_price * p_quantity;

  INSERT INTO inventory_sales (
    gym_id, inventory_id, product_name, variant_name,
    quantity, unit_price, total_price, payment_mode
  ) VALUES (
    v_product.gym_id, p_inventory_id, v_product.product_name, v_product.variant_name,
    p_quantity, v_price, v_total, v_mode
  )
  RETURNING id INTO v_sale_id;

  UPDATE inventory
  SET initial_stock = initial_stock - p_quantity,
      updated_at = NOW()
  WHERE id = p_inventory_id;

  RETURN jsonb_build_object(
    'sale_id',         v_sale_id,
    'product_name',    v_product.product_name,
    'quantity',        p_quantity,
    'total_price',     v_total,
    'remaining_stock', v_product.initial_stock - p_quantity
  );
END;
$$;
