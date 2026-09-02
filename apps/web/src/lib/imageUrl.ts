/**
 * Cloudinary delivery transformations.
 *
 * Every image in the app is stored as the bare `secure_url` that
 * uploads.controller.ts hands back, and was being served at whatever resolution
 * the uploader's phone happened to produce — a 4 MB portrait behind a 32px
 * avatar. Cloudinary will resize and re-encode on delivery for free; it just
 * has to be asked, by inserting a transformation into the URL path:
 *
 *   .../image/upload/v1712/buildora/abc/photo.jpg
 *   .../image/upload/f_auto,q_auto,c_limit,w_640/v1712/buildora/abc/photo.jpg
 *
 * `f_auto` picks WebP/AVIF per browser, `q_auto` picks a quality that holds up
 * visually, and the width cap does the rest.
 *
 * Transforming on read rather than at upload time is deliberate: the original
 * stays untouched in Cloudinary, so changing a size here restyles every image
 * already uploaded, with no migration.
 */

/** Only `/image/upload/` is safe to touch — `/raw/upload/` holds the 3D models. */
const CLOUDINARY_IMAGE = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

/**
 * A leading segment like `f_auto,q_auto` or `w_400` means someone already
 * transformed this URL; stacking another set on top would silently fight it.
 */
const ALREADY_TRANSFORMED = /^[a-z]{1,3}_[^/]+/;

function withTransform(url: string | undefined, transform: string): string | undefined {
  if (!url) return url;
  const match = CLOUDINARY_IMAGE.exec(url);
  // Not a Cloudinary image: a pasted external link, a local asset, a data URI.
  // Those are left exactly as they are rather than guessed at.
  if (!match) return url;

  // Read the groups out one at a time rather than destructuring: the project
  // compiles with noUncheckedIndexedAccess, so an indexed match is string |
  // undefined even when the pattern guarantees both groups.
  const prefix = match[1];
  const rest = match[2];
  if (!prefix || !rest) return url;

  if (ALREADY_TRANSFORMED.test(rest)) return url;
  return `${prefix}${transform}/${rest}`;
}

/**
 * A photo shown at up to `width` CSS pixels. `c_limit` only ever shrinks, so a
 * picture smaller than the cap is passed through untouched instead of being
 * upscaled into a bigger file than the original.
 *
 * Pass roughly twice the CSS width for anything that should stay sharp on a
 * phone screen.
 */
export function imageAt(url: string | undefined, width: number): string | undefined {
  return withTransform(url, `f_auto,q_auto,c_limit,w_${width}`);
}

/**
 * A square avatar. `c_fill` crops to the exact box rather than letterboxing,
 * which is what a round frame needs. Default (centre) gravity on purpose:
 * Cloudinary's face and content-aware gravities are plan-gated, and a centre
 * crop that always works beats a clever one that 400s on the free tier.
 */
export function avatarAt(url: string | undefined, size: number): string | undefined {
  return withTransform(url, `f_auto,q_auto,c_fill,w_${size},h_${size}`);
}
