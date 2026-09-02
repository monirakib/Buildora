import { describe, expect, it } from "vitest";
import { avatarAt, imageAt } from "./imageUrl";

/**
 * These helpers sit in front of every image the app renders, and every failure
 * mode is quiet: transform the wrong URL and you get a broken image, skip the
 * transform and you get a working page that ships a 4 MB photo behind a 32px
 * avatar. Neither throws, so neither shows up without a test.
 *
 * The rule being pinned down: rewrite Cloudinary *image* URLs, and nothing else.
 */

const UPLOAD = "https://res.cloudinary.com/demo/image/upload";

describe("imageAt", () => {
  it("inserts the transform ahead of the version segment", () => {
    expect(imageAt(`${UPLOAD}/v1712/buildora/u1/photo.jpg`, 640)).toBe(
      `${UPLOAD}/f_auto,q_auto,c_limit,w_640/v1712/buildora/u1/photo.jpg`
    );
  });

  it("works on a URL with no version segment", () => {
    expect(imageAt(`${UPLOAD}/buildora/u1/photo.jpg`, 320)).toBe(
      `${UPLOAD}/f_auto,q_auto,c_limit,w_320/buildora/u1/photo.jpg`
    );
  });

  it("uses c_limit, which only ever shrinks", () => {
    // Upscaling a small original would produce a *bigger* file than the one it
    // replaced, which is the opposite of the point.
    expect(imageAt(`${UPLOAD}/v1/x.jpg`, 2000)).toContain("c_limit");
  });

  it("leaves a URL that already carries a transform alone", () => {
    // Stacking a second set on top would silently fight the first.
    const already = `${UPLOAD}/f_auto,q_auto,w_400/v1/x.jpg`;
    expect(imageAt(already, 800)).toBe(already);
  });

  it("never touches a raw upload — that is where the 3D models live", () => {
    const model = "https://res.cloudinary.com/demo/raw/upload/v1/design.glb";
    expect(imageAt(model, 640)).toBe(model);
  });

  it("passes through anything that is not Cloudinary", () => {
    // Project documents accept a pasted external URL, and the landing page
    // serves local assets. Guessing at either would break them.
    for (const url of [
      "https://example.com/pasted.png",
      "/landing/hero.jpg",
      "data:image/png;base64,iVBORw0KGgo=",
      "https://res.cloudinary.example.com/image/upload/v1/spoof.jpg",
    ]) {
      expect(imageAt(url, 640)).toBe(url);
    }
  });

  it("passes undefined straight through", () => {
    // Every caller renders a fallback when the field is absent, so this must
    // stay undefined rather than becoming the string "undefined".
    expect(imageAt(undefined, 640)).toBeUndefined();
  });

  it("handles any cloud name, not just one", () => {
    const other = "https://res.cloudinary.com/buildora-prod/image/upload/v9/a/b.png";
    expect(imageAt(other, 100)).toContain(
      "/buildora-prod/image/upload/f_auto,q_auto,c_limit,w_100/"
    );
  });
});

describe("avatarAt", () => {
  it("crops to an exact square with c_fill", () => {
    // A round frame needs a square crop; c_limit would letterbox it.
    expect(avatarAt(`${UPLOAD}/v1/me.jpg`, 96)).toBe(
      `${UPLOAD}/f_auto,q_auto,c_fill,w_96,h_96/v1/me.jpg`
    );
  });

  it("asks for no gravity, because the clever ones are plan-gated", () => {
    // g_face and g_auto are add-ons on the free tier. A centre crop that always
    // works beats a smarter one that 400s.
    const url = avatarAt(`${UPLOAD}/v1/me.jpg`, 96) ?? "";
    expect(url).not.toContain("g_face");
    expect(url).not.toContain("g_auto");
  });

  it("leaves non-Cloudinary avatars alone", () => {
    expect(avatarAt("https://example.com/me.png", 96)).toBe("https://example.com/me.png");
  });
});
