/**
 * The Buildora mark from the navbar, as a PNG the mail can carry with it.
 *
 * Why a picture and why bundled into the source:
 *
 *   - The navbar draws the mark as inline SVG. Gmail and Outlook both refuse
 *     inline SVG outright, so email needs a raster copy of it.
 *   - Linking one would mean hosting it somewhere public; a localhost URL is
 *     useless the moment the mail leaves the machine. Carrying the bytes along
 *     as an attachment referenced by Content-ID (the `cid:` src in
 *     email-template.ts) works everywhere and needs no host at all.
 *   - It lives in a .ts file rather than beside the code as a .png because tsup
 *     bundles this app into dist/ and would not copy a loose asset with it.
 *
 * 72x72 for a 36px slot, so it stays sharp on a high-density screen. To
 * regenerate it, draw the navbar's own path — "M4 20V8.5L12 3l8 5.5V20",
 * stroked in #1c1917 on a white tile with an 18px corner radius — and
 * base64 the resulting PNG back into the constant below.
 */

/**
 * The name the attachment travels under, and the Content-ID the template's
 * <img src="cid:…"> points at — deliberately the same string, because some
 * mail APIs address an inline attachment by its filename rather than by a
 * separate id, and keeping the two identical satisfies either kind.
 */
export const LOGO_CID = "buildora.png";

const LOGO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAE4UlEQVR4nOycX2xTVRzHv23mw9wSE2PWTtlWIo5iwphLdBuY" +
  "DdkmDIlSYiISAhhZ160rwwd9E4xvqIAKjE2N4r93E0A0Qdy6zSEPCNsS6gqsRiJtomTNHpyLrP5+t+vS9rY7ndzbduv5JL+e" +
  "u3NOb9dPfr3n/j15WCChUMhKxRaKRoqHKR6cjXxkF39T3JmNPyjOU5wxGAyehazEkGpHEmOn4g2KR7G4uUFxiER9nEpnoSAS" +
  "00BFF0U5lhacSftJ1PfzdUoqiMTcR8WHFA4sbbopnCRqJlFjQkEkh7cppynWIjfg7dNLJOlOfINKEMlZScV3FBbkFj6KTSTp" +
  "1+jKGEEkJ4+KXop1yE3OUTxPkv6NVBjjOhxH7sphmhF2MMdcBlH2bELYoIREURbxZiYsiORwJo1QPA4JM0KCKngh8hPbBSkn" +
  "mtWUNNt5ISJoqe/r/B/284uBTJkRPlZJ+bAjRwhRPMLD+lZIOYlgJy+woBpIklHJgsyQJMMsBc2PhTfSE7TwACSJCLKgECRJ" +
  "MSJLOHrkMJ6sqlSCl7OFjGfQ+M2b6HC2Y/jqlZj6ijWV6OruQVlZGTJJRjPo1Gef4tmmBpUchusaN6zHF5+fQibJSAYFAgG8" +
  "1ulCv9udUv+6+noc/eAYioqKkG7SnkFnz5xGw/q6hHJKS0tRUlKqqnf39SnvOfftWaSbtAmanJyEy9kGh70FwWAwps1oNMLp" +
  "2ofe/kGKAbR3uJS6aCYmJmDf+yo6XR3KutJFWn5iP18cgrO9DQG/X9VWZrEoG+OKijUx9cPDV9HuaMVvPp/qPSazGSe6TqK6" +
  "phZ6o2sGTU1N4eCBN/HiNptKDp2Qgr3VgfMXelVyGK7jtr0tdqVvNLwuXufbbx3E9PQ09ES3DBodGUGbww7f+LiqbdmyEiVr" +
  "nqiqSmldv1y+rGTTrVu/q9pWrHgMJ3s+gnXVKuiBLhnEw3fzxqaEcnbveQU/9rlTlsNwX37Prt17VG3Xr3vR1PAMvv7qS+iB" +
  "5hnk9Y5hQ32dqt5cXIxjx0+gpvberkX+NDiAzn0u+G/fVrX1Dw7Bsnw5tETzDPKOjanqduzciV73wD3LYdaue5qyqR/bX96h" +
  "arvmuQat0VxQfEJufm4LDr3zHgoKCqAVhYWFePfwETQ3b46pn7l7F1qTB42ZmYm9ByB+BNISQ9y+kh7jTdYczWcrUpAAKUiA" +
  "FCRAChIgBQmQggRIQQKkIAFSkAApSIAUJEAKEiAFCZCCBEhBAjQ/YWYyxd6Pxdew9MJkMsX8XVRkgtZonkFPVVejvHylspyf" +
  "fz9sNhv0Yqttm/IZjNVqVT5ba3S7LubxeJR/Oh3o+VnyDjMBciMtgAX9A0kygizID0ky/FLQ/Ph5P0gKSo6PM+giJMm4wsM8" +
  "TxjAD9nLJ35i4d2fYiNdO+fbMS5BEs8lchOI7Ad1QxLP+/wS/VAv3829GhJmlLJHcaFk0Oy8FQcgifB6ZGHuUIMkfUPFJ5D0" +
  "RJ6ZZ+TUFLEMUdRFT02RaHKTh6gYxNKbL0iEl6KW5PwVXak6mqcOf3JHhKeMyRUuUNTEy2ESnu6YnUdnI3Jj+OftblOiuYOY" +
  "pOeDeGSjaKNFnvRkQROjLRJGKRrpO7Ykm32KEZ4w4zm+KPg+f57k7QYWP/wdWnk/h+IHUecFH3/l2jSB/wEAAP//3xP4uAAA" +
  "AAZJREFUAwBXiXfpt/TJlwAAAABJRU5ErkJggg==";

/** The decoded bytes, attached to every message by email.ts. */
export const LOGO_PNG: Buffer = Buffer.from(LOGO_BASE64, "base64");
