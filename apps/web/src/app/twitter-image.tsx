/**
 * The same card again, under the name Twitter/X looks for.
 *
 * Next only maps the Open Graph file to `og:image`; a route that wants
 * `twitter:image` has to exist as its own file. Re-exported rather than
 * duplicated so there is one drawing and one place to change it.
 */
export { default, alt, size, contentType } from "./opengraph-image";
