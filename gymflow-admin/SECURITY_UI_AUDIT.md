# GymFlow Admin Panel — Security & UI/UX Audit Report

**Date:** 30 June 2026  
**Audited By:** Kiro AI Agent  
**Scope:** Complete admin panel security and user experience analysis

---

## 🔴 CRITICAL SECURITY ISSUES

### 1. **EXPOSED SECRETS IN .env.local (P0 - HIGHEST PRIORITY)**
**File:** `.env.local`  
**Issue:** ALL production secrets are committed and visible:
- ✗ Supabase Service Role Key exposed
- ✗ Sentry Auth Token exposed  
- ✗ Admin Panel Secret exposed
- ✗ Upstash Redis credentials exposed

**Risk:** Complete system compromise — attacker can:
- Access/modify ALL gym data (service role key)
- Read all error logs (Sentry token)
- Bypass admin authentication (panel secret)
- Access/flush Redis cache (Upstash creds)

**Fix Required:**
```bash
# .env.local MUST BE IN .gitignore
echo ".env.local" >> .gitignore
git rm --cached .env.local
git commit -m "Remove exposed secrets"

# ROTATE ALL SECRETS IMMEDIATELY:
# 1. Generate new Supabase service role key
# 2. Generate new Sentry auth token
# 3. Generate new admin panel secret
# 4. Regenerate Upstash Redis credentials
```

**Status:** 🚨 **URGENT - Rotate all production secrets immediately**

---

### 2. **Public ANON Key Exposed in Sidebar Component (P0)**
**File:** `components/layout/Sidebar.tsx` (line 21, 52)  
**Issue:** Uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` which is visible to anyone who views the admin panel source

```ts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  // ❌ EXPOSED
```

**Risk:** Admin panel is server-rendered but uses client-side Supabase for realtime. The anon key is publicly visible in browser devtools.

**Fix:** Use server-side API routes for all database operations instead of direct client-side queries.

---

### 3. **No Rate Limiting on Critical Actions (P1)**
**Files:** All API routes except `/api/auth`  
**Issue:** Only login has rate limiting. No protection on:
- `/api/support` (message broadcasting)
- `/api/support/tickets` (ticket resolution)
- Gym ban/unban operations

**Risk:** Abuse via automation — spam all gym owners, overload database, DoS attack.

**Fix:** Add rate limiting middleware to all mutation routes.

---

### 4. **Missing CSRF Protection (P1)**
**Files:** All POST/PATCH/DELETE routes  
**Issue:** No CSRF tokens or SameSite=Strict cookies

**Risk:** Cross-site request forgery — if admin visits malicious site while logged in, attacker can perform admin actions.

**Fix:** 
- Change cookie SameSite to `'strict'` (currently `'lax'`)
- Add CSRF token validation for state-changing operations

---

### 5. **Weak Session Management (P1)**
**File:** `lib/auth.ts`  
**Issues:**
- ✗ No session rotation after privilege escalation
- ✗ No device tracking
- ✗ No concurrent session limit
- ✗ No activity-based timeout (only absolute 8h expiry)

**Risk:** Stolen session tokens remain valid for 8 hours with no revocation mechanism.

**Fix:** Implement proper session management:
```ts
// Add to JWT payload
interface SessionPayload {
  role: 'super_admin'
  jti: string        // Unique session ID
  iat: number        // Issued at
  exp: number        // Expiry
  device?: string    // User agent hash
  lastActivity: number
}

// Add session store in Redis
// Allow logout from specific devices
// Implement sliding expiry (extend on activity)
```

---

## 🟠 HIGH PRIORITY SECURITY ISSUES

### 6. **SQL Injection via String Interpolation (P1)**
**File:** `app/dashboard/page.tsx` (line 44)  
**Issue:** Date string directly inserted into query without validation

```ts
.eq('date', new Date().toISOString().slice(0, 10))  // Potential injection point
```

**Fix:** Use parameterized queries or validate format strictly.

---

### 7. **No Input Sanitization (P1)**
**Files:** `app/support/page.tsx`, API routes  
**Issue:** User inputs (gym names, ticket subjects, messages) not sanitized before storage/display

**Risk:** Stored XSS — malicious gym owner creates ticket with `<script>` tags, admin views it, script executes with admin privileges.

**Fix:** Sanitize ALL user inputs:
```ts
import DOMPurify from 'isomorphic-dompurify'

const cleanSubject = DOMPurify.sanitize(subject)
const cleanMessage = DOMPurify.sanitize(message, { ALLOWED_TAGS: [] })
```

---

### 8. **Unvalidated Redirects (P2)**
**File:** `middleware.ts` (line 29)  
**Issue:** After auth, redirects to original URL without validation

```ts
const url = request.nextUrl.clone()
url.pathname = '/auth'
return NextResponse.redirect(url)  // Open redirect if manipulated
```

**Fix:** Whitelist allowed redirect paths.

---

### 9. **Missing Authentication on WebSocket Channels (P2)**
**File:** `components/layout/Sidebar.tsx`, `app/support/page.tsx`  
**Issue:** Realtime subscriptions use anon key with no additional auth check

**Risk:** Anyone with the anon key (publicly visible) can subscribe to admin channels and see realtime ticket updates.

**Fix:** Use RLS policies or server-side-only operations for sensitive realtime data.

---

## 🟡 MEDIUM PRIORITY ISSUES

### 10. **Weak Password Policy (P2)**
**File:** `app/api/auth/route.ts`  
**Issue:** Admin password is a single static string with no complexity requirements

**Fix:** Implement proper admin user management:
- Multi-factor authentication
- Minimum password length/complexity
- Password rotation policy
- Multiple admin accounts with different privileges

---

### 11. **No Audit Logging (P2)**
**Files:** All API routes  
**Issue:** No logging of admin actions (who banned which gym, who sent what message, etc.)

**Risk:** No accountability — if malicious action occurs, no way to trace who did it.

**Fix:** Log all admin actions to separate audit table:
```sql
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  admin_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 12. **Insecure Error Messages (P2)**
**Files:** Various API routes  
**Issue:** Detailed error messages leak system information

```ts
return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
```

**Fix:** Generic errors to client, detailed logging server-side only.

---

## 🔵 UI/UX ISSUES

### 13. **No Loading States on Critical Actions**
**Files:** `app/gyms/page.tsx`, `app/dashboard/page.tsx`  
**Issue:** Buttons don't show loading state during async operations

**Fix:** Add loading spinners and disable buttons during operations.

---

### 14. **No Confirmation Dialogs for Destructive Actions**
**File:** Gym ban functionality  
**Issue:** No "Are you sure?" prompt before banning a gym (destructive action)

**Fix:** Add confirmation modal:
```tsx
<ConfirmDialog 
  title="Ban Gym?"
  message="This will immediately revoke access for this gym. Members cannot check in and owner cannot log in."
  confirmText="Ban Gym"
  onConfirm={handleBan}
/>
```

---

### 15. **Poor Mobile Responsiveness**
**Files:** All pages  
**Issue:** Fixed 60px sidebar causes horizontal scroll on mobile

**Fix:** Make sidebar collapsible/drawer on mobile:
```css
@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
}
```

---

### 16. **No Search/Filter on Large Lists**
**File:** `app/gyms/page.tsx`  
**Issue:** If 100+ gyms, no way to quickly find one

**Fix:** Add search input:
```tsx
<input 
  type="search"
  placeholder="Search gyms..."
  onChange={e => setFilter(e.target.value)}
  className="admin-input"
/>
```

---

### 17. **No Pagination**
**Files:** `app/gyms/page.tsx`, `app/support/page.tsx`  
**Issue:** Fetches ALL gyms/tickets at once — slow for 1000+ records

**Fix:** Implement cursor-based pagination:
```ts
.range(offset, offset + limit)
```

---

### 18. **Inconsistent Error Handling**
**Files:** Various components  
**Issue:** Some errors show toast, some show inline, some do nothing

**Fix:** Standardize error display strategy.

---

### 19. **No Empty States with Actions**
**Files:** `app/gyms/page.tsx`, `app/support/page.tsx`  
**Issue:** Empty states just say "No data" — not actionable

**Fix:** Add CTAs:
```tsx
<EmptyState 
  icon={<Building2 />}
  title="No gyms yet"
  description="Gyms will appear here once users sign up"
  action={<Link href="/gyms/invite">Invite Gym Owner</Link>}
/>
```

---

### 20. **No Keyboard Shortcuts**
**Issue:** Admin panel requires extensive mouse use

**Fix:** Add common shortcuts:
- `Cmd/Ctrl + K` → Search
- `Cmd/Ctrl + /` → Command palette
- `Escape` → Close modals

---

## 📊 Performance Issues

### 21. **N+1 Query Problem**
**File:** `app/gyms/page.tsx` (line 14-20)  
**Issue:** Fetches all gyms, then separate query for member counts

**Fix:** Use JOIN or RPC function:
```sql
CREATE FUNCTION get_gyms_with_counts() RETURNS TABLE(...) AS $$
  SELECT g.*, COUNT(m.id) as member_count
  FROM gyms g
  LEFT JOIN members m ON m.gym_id = g.id
  GROUP BY g.id
$$ LANGUAGE sql;
```

---

### 22. **No Caching Strategy**
**Files:** All pages  
**Issue:** Every page load hits database, even for mostly-static data (gym list, etc.)

**Fix:** Add Redis caching like main app.

---

### 23. **Large Bundle Size**
**Issue:** Imports entire `lucide-react` library

**Fix:** Use individual icon imports:
```ts
import { Building2 } from 'lucide-react/dist/esm/icons/building-2'
```

---

## ✅ GOOD SECURITY PRACTICES FOUND

1. ✓ JWT-based authentication with HS256
2. ✓ HTTPOnly cookies (not accessible via JS)
3. ✓ Secure flag on cookies in production
4. ✓ Login rate limiting (10 attempts per 15min per IP)
5. ✓ CSP headers configured in next.config.js
6. ✓ HSTS header with 2-year max-age
7. ✓ X-Frame-Options: DENY
8. ✓ X-Content-Type-Options: nosniff
9. ✓ Middleware protection on all routes
10. ✓ Service role key used (not anon key) for admin operations

---

## 🎯 PRIORITY FIX ORDER

### Phase 1 (IMMEDIATE - Next 24 hours)
1. 🔴 Rotate all exposed secrets in .env.local
2. 🔴 Remove .env.local from repo, add to .gitignore
3. 🔴 Remove client-side Supabase usage (Sidebar realtime)
4. 🔴 Add input sanitization for XSS prevention
5. 🟠 Add rate limiting to all mutation routes

### Phase 2 (This Week)
6. 🟠 Implement CSRF protection
7. 🟠 Add confirmation dialogs for destructive actions
8. 🟠 Add audit logging for all admin actions
9. 🟡 Implement proper session management
10. 🟡 Add pagination to gym/ticket lists

### Phase 3 (Next Sprint)
11. 🟡 Build mobile-responsive sidebar
12. 🟡 Add search/filter to all lists
13. 🟡 Implement keyboard shortcuts
14. 🔵 Add loading states to all buttons
15. 🔵 Standardize error handling

---

## 📝 SUMMARY

**Total Issues Found:** 23  
- 🔴 Critical Security: 5  
- 🟠 High Security: 4  
- 🟡 Medium Security: 3  
- 🔵 UI/UX: 8  
- 📊 Performance: 3  

**Good Practices:** 10 security controls already in place

**Estimated Fix Time:** 
- Phase 1 (Critical): 8-12 hours
- Phase 2 (High): 16-20 hours  
- Phase 3 (Medium/Low): 24-32 hours

**Overall Security Grade:** C+ (Good foundation, critical fixes needed)
**Overall UX Grade:** B- (Functional, needs polish)

---

**Next Steps:**
1. Rotate all production secrets IMMEDIATELY
2. Apply Phase 1 fixes (security critical)
3. Schedule Phase 2 for this week
4. Plan Phase 3 for next sprint
