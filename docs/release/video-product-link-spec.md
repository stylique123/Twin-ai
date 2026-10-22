# Video-to-product linking with confirmation: spec

Status: spec only (thread 10). No code or migration yet.

## Rule

A video is linked to a product only after the creator confirms it. The system may suggest; it
never links silently.

## Flow

1. After upload, suggest at most one product (or "none") with a short reason.
2. The creator sees "Is this video about <product>?" with Yes / Pick another / Not a product.
3. Only "Yes" or a picked product writes the link. "Not a product" records a no-link choice so
   we do not ask again.
4. The link can be removed later; removal is final until she links again.

## Data (for the later migration)

`video_product_links(video_id, product_id, confirmed_by, confirmed_at, source: 'suggested'|'picked')`.
A row exists only for a confirmed link. Deleting the video deletes its links.

## Tests to write with the code

- No row is written without a confirm action.
- "Not a product" never writes a link.
- Video deletion removes links.

## Kill switch

`VIDEO_PRODUCT_LINK_ENABLED`, default off.
