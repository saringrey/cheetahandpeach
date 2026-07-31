# Personal raft sketchbook pages

Put image files in this folder, then add one entry per image to
`manifest.json`:

```json
{
  "pages": [
    {
      "id": "river-study",
      "file": "river-study.jpg",
      "alt": "A pencil sketch of two mugs beside a river.",
      "title": "By the river",
      "caption": "Drawn on a quiet afternoon."
    }
  ]
}
```

Supported image types: `.avif`, `.gif`, `.jpg`, `.jpeg`, `.png`, `.svg`, and
`.webp`.

- `id` must be unique and contain only letters, numbers, `_`, or `-`.
- `file` is relative to this folder. Subfolders such as `pages/one.png` work.
- `alt` should describe the image for someone who cannot see it.
- `title` and `caption` are optional.
- Remote URLs and paths outside this folder are ignored.
- Missing or invalid files show a quiet blank-page fallback. They never stop
  the raft or the rest of the game.
