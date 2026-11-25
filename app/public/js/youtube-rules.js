// YouTube's custom-thumbnail rules, kept in one place so they are easy to update.
// Source: the build brief (rules as of November 2026). Check YouTube Help →
// "Add video thumbnails" before relying on them, and edit the numbers here if
// YouTube changes them.

export const YOUTUBE = {
  // Recommended size for the master file.
  width: 3840,
  height: 2160,
  // YouTube rejects anything narrower than this.
  minWidth: 640,
  // Size limit when uploading from the YouTube phone app. We keep the JPG
  // under this so it works everywhere. (Desktop allows 50 MB.)
  // Measured in decimal megabytes (2,000,000 bytes) to stay on the safe side.
  mobileMaxBytes: 2_000_000,
  desktopMaxBytes: 50_000_000,
  // YouTube's "Test & compare" A/B test takes up to this many thumbnails.
  maxVariants: 3,
};
