export const PUBLIC_BRAND_NAME = 'Sarva Horizon';
export const PUBLIC_BRAND_TAGLINE = 'Application Development, Digital Marketing, and Event Solutions';
export const PRODUCT_BRAND_NAME = 'Sarva';
export const PRIMARY_SEO_PHRASE = 'Sports Complex Management Platform';
export const RIGHTS_HOLDER_NAME = 'Sarva Horizon';
export const RIGHTS_HOLDER_ADDRESS = 'Sarva Horizon, Lingarajapuram, Bangalore - 560084';
export const APPLICATION_RIGHTS_NOTE = 'Software products, digital growth, and event services by Sarva Horizon.';
export const WHATSAPP_DISPLAY_PHONE = '7019572701';
export const WHATSAPP_PHONE_E164 = '917019572701';
export const DEFAULT_PUBLIC_SUPPORT_EMAIL = 'contact@spark7.in';
export const DEFAULT_SITE_URL = 'https://www.spark7.in';

export const buildWhatsappContactUrl = (message?: string): string =>
  `https://wa.me/${WHATSAPP_PHONE_E164}?text=${encodeURIComponent(
    message || 'Hello Sarva Horizon, I would like to know more about your software, digital marketing, and event services.'
  )}`;
