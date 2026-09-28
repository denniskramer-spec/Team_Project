import mongoose from 'mongoose';

export const slugify = (name) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'group';

// Groups are data, not hard-coded, so new groups appear in every channel automatically.
// A group's bosses are the users with role "boss" in that group.
const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, maxlength: 50 },
    // URL-friendly key used in routes such as /plan/group1. Set once: renaming
    // a group keeps its address, so links and bookmarks keep working.
    slug: { type: String, unique: true },
  },
  { timestamps: true },
);

groupSchema.pre('save', function setSlug() {
  if (!this.slug) this.slug = slugify(this.name);
});

export default mongoose.model('Group', groupSchema);
