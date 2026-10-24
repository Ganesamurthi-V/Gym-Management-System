/* One source for the support contact details and the support promise, so the footer,
   FAQ and onboarding copy cannot drift apart. The promise is a business commitment,
   not something the product enforces. */
export const SUPPORT_EMAIL = 'support@gymflow.sbs';
export const SUPPORT_PHONE_DISPLAY = '+91 93848 86895';
export const SUPPORT_PHONE_HREF = '+919384886895';
export const SUPPORT_PROMISE = 'Direct support from the person who builds GymFlow. We reply within 24 hours.';

// A mailto link with the subject and body already filled in, so the visitor's mail app
// opens on a ready-to-send message.
export const MAIL_BODY = [
  'Hi GymFlow team,',
  '',
  'I saw your website and would like to know more about GymFlow for my gym.',
  '',
  'Name:',
  'Gym name:',
  'City:',
  'Phone number:',
  'Thank you.',
].join('\n');

export const MAIL_URL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  'Enquiry about GymFlow',
)}&body=${encodeURIComponent(MAIL_BODY)}`;

// wa.me wants the number as digits only, country code first, no + or spaces.
export const WHATSAPP_URL = `https://wa.me/${SUPPORT_PHONE_HREF.replace(/\D/g, '')}?text=${encodeURIComponent(
  'Hi GymFlow, I saw your website and would like to know more about GymFlow for my gym.',
)}`;
