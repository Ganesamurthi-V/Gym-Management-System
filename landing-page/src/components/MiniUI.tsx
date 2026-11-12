/* Two small, simple product cards drawn in HTML: a taste of the members page and of one inventory product, not
   a copy of the whole console. Sample data. They are decorative (aria-hidden by the caller) and follow the
   light and dark theme through the site's tokens. */

const MEMBERS = [
  { name: 'Divya Menon', plan: 'Annual', ends: 'Ends 08 Nov', status: 'Expiring' },
  { name: 'Prakash Selvam', plan: 'Quarterly', ends: 'Ends 07 Nov', status: 'Expiring' },
  { name: 'Akhil Babu', plan: 'Annual', ends: 'Ends 04 Mar 2027', status: 'Active' },
  { name: 'Anitha Raj', plan: 'Monthly', ends: 'Ends 28 Jan 2027', status: 'Active' },
] as const;

const initials = (name: string) =>
  name
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2);

export function MembersCard() {
  return (
    <div className="mini">
      <div className="mini__head">
        <strong>Members</strong>
        <span className="mini__btn">+ Add member</span>
      </div>
      <div className="mini__stats" data-replay>
        <div>
          <b>20</b>
          <span>Active</span>
        </div>
        <div>
          <b>3</b>
          <span>Expiring</span>
        </div>
        <div>
          <b>177</b>
          <span>Expired</span>
        </div>
      </div>
      <ul className="mini__rows" data-replay>
        {MEMBERS.map(m => (
          <li key={m.name}>
            <span className="mini__avatar">{initials(m.name)}</span>
            <span className="mini__who">
              <b>{m.name}</b>
              <small>
                {m.plan} · {m.ends}
              </small>
            </span>
            <span className={`mini__pill mini__pill--${m.status.toLowerCase()}`}>{m.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const VARIANTS = [
  { name: '2 kg, Chocolate', price: '₹3,499', stock: 12 },
  { name: '2 kg, Vanilla', price: '₹3,499', stock: 8 },
  { name: '1 kg, Chocolate', price: '₹1,999', stock: 3 },
] as const;

export function InventoryCard() {
  return (
    <div className="mini">
      <div className="mini__head">
        <strong>Whey Protein</strong>
        <span className="mini__btn">Sell stock</span>
      </div>
      <div className="mini__stats" data-replay>
        <div>
          <b>38</b>
          <span>Units sold</span>
        </div>
        <div>
          <b>₹1.2L</b>
          <span>Revenue</span>
        </div>
      </div>
      <ul className="mini__rows" data-replay>
        {VARIANTS.map(v => (
          <li key={v.name}>
            <span className="mini__who">
              <b>{v.name}</b>
              <small>{v.price}</small>
            </span>
            <span className={`mini__pill ${v.stock <= 3 ? 'mini__pill--expiring' : 'mini__pill--active'}`}>{v.stock} in stock</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
