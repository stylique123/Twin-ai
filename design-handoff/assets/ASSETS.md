# Assets: every picture and video the design uses

Everything the boards show is in this folder. The boards load these files directly (`../assets/...`), so they work offline. Nothing comes from claude.ai any more.

All people in these files are **fictional demo people** (Maya and the example creators). None of them is a real creator.

## Where each file goes in the app

There are two kinds of file here. Treat them differently.

| Kind | Files | What to do in the app |
|---|---|---|
| **Marketing (keep)** | Everything in `videos/`, plus `creator-*.jpg` and `maya-*.jpg` | Copy into `apps/web/public/landing/` and use them on the Landing page only (hero phones, "who it's for" cards, the before/after loop demo). Compress first: videos to H.264, muted, under 1 MB each, with a `.jpg` poster frame; images to WebP around 1080 px tall. Always `muted`, `playsInline`, `loop`, `preload="metadata"`, and don't autoplay when the user prefers reduced motion |
| **Placeholders (don't ship in the app)** | `gallery-*.jpg`, `tour-background-*.jpg`, and every use of `maya-*` inside app screens | They stand in for **real data**: the user's own camera, their uploaded clips, Gallery thumbnails from the real feed, and the real Home screen behind the tour. In the app, load the real image/video. Show the empty or skeleton state when there is none. You may keep these in `apps/web/src/test/fixtures/` for Storybook and tests |
| **Brand** | `brand/twinai-logo-mark.svg` | The logo mark (cream top, amber→coral→teal bottom). Use the repo's existing logo component if it has one, otherwise this file |

The font is **Geist** (Google Fonts, weights 400/500/600/700). Use the repo's existing font setup; don't add a second copy.

## File list

### Videos (`videos/`, 480×854 vertical, about 6 seconds, silent loops)

| File | Who / what | Used on boards |
|---|---|---|
| `maya-talking-kitchen.mp4` | Maya talking to camera in her home roastery | Landing (hero phones, "local business" card), MLanding, Record + MRecord (the live camera preview behind the teleprompter) |
| `creator-coach-talking.mp4` | A coach talking at home by a bookshelf | Landing ("coach" card and the rotating hero phone) |
| `creator-realestate-talking.mp4` | A real-estate agent talking outdoors | Landing ("real estate" card) |
| `creator-agency-talking.mp4` | An agency owner at a desk with a ring light | Landing ("agency" card) |

On the Landing board the four "who it's for" cards swap between these four videos (`woVid` in the board's script). The order is coach, local business (Maya), real estate, agency.

### Images (`images/`)

| File | What it shows | CSS class on the boards | Used on boards |
|---|---|---|---|
| `maya-talking-kitchen.jpg` | Maya talking, kitchen roastery | `.cam`, `.ph-local` | The camera/clip background (`.cam`) on Record, Review, Upload, Edit, Post and their phone versions; Landing; one tile in the Create Gallery tab |
| `maya-holding-mug.jpg` | Maya holding a mug by the window | `.ph-s_window` | A scene thumbnail on Edit, Upload, Landing |
| `maya-holding-beans.jpg` | Maya holding roasted beans | `.ph-s_tray` | A scene thumbnail on Review, Post, Landing |
| `creator-coach-home.jpg` | The coach (still) | `.ph-coach` | Landing "who it's for" cards; tiles in the Create Gallery tab |
| `creator-realestate-outdoors.jpg` | The real-estate agent (still) | `.ph-realestate` | Landing "who it's for" cards; tiles in the Create Gallery tab |
| `creator-agency-desk.jpg` | The agency owner (still) | `.ph-agency` | Landing "who it's for" cards; tiles in the Create Gallery tab |
| `gallery-01-market-roaster.jpg` | A roaster at a market stall | `.ph-g1` | Gallery board + Create Gallery tab; the found-video thumbnail in "A video I liked" |
| `gallery-02-cafe-tasting.jpg` | A woman tasting coffee in a café | `.ph-g2` | Gallery board + Create Gallery tab |
| `gallery-03-roasting-on-stove.jpg` | A man roasting beans on a stove | `.ph-g3` | Gallery board + Create Gallery tab |
| `gallery-04-beans-on-tray.jpg` | Hands sorting green beans on a tray | `.ph-g4` | Gallery board + Create Gallery tab |
| `gallery-05-cart-owner-on-phone.jpg` | A café owner on the phone | `.ph-g5` | Gallery board + Create Gallery tab |
| `gallery-06-late-night-latte.jpg` | A late-night latte pour | `.ph-g6` | Gallery board + Create Gallery tab |
| `tour-background-desktop.jpg` | A screenshot of the desktop Home screen | `.tourbg` | Tour (blurred behind the first-time tour) |
| `tour-background-phone.jpg` | A screenshot of the phone Home screen | `.tourbg` | MTour |

**About the tour backgrounds:** in the real app the tour sits on top of the **live** Home page (dimmed and blurred). The screenshots exist only because the design board couldn't show a live page behind it. Don't use them in the app.
