#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for command in curl sha256sum readelf node git; do
  command -v "$command" >/dev/null || { echo "Required tool is missing: $command" >&2; exit 1; }
done

# electron-builder uses an older AppImage runtime and does not embed the
# standard AppImageUpdate metadata. Repack only the Linux AppImage artifact;
# the Debian package and unpacked executable remain unchanged.
release_dir="$(cd "${1:-release}" && pwd)"
mapfile -d '' -t appimages < <(find "$release_dir" -maxdepth 1 -type f -name '*.AppImage' -print0)
if (( ${#appimages[@]} != 1 )); then
  echo "Expected exactly one AppImage in $release_dir, found ${#appimages[@]}." >&2
  exit 1
fi

appimage="${appimages[0]}"
name="$(basename "$appimage")"
if [[ ! "$name" =~ ^CF-Compass-[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?-x86_64\.AppImage$ ]]; then
  echo "Unexpected AppImage name: $name" >&2
  exit 1
fi
version="${name#CF-Compass-}"
version="${version%-x86_64.AppImage}"
update_channel="$(node "$script_dir/verify-appimage.mjs" --resolve-update-channel "$version")"
if [[ -e "$appimage.zsync" ]]; then
  echo 'An update sidecar already exists; use a clean build output to avoid mixing releases.' >&2
  exit 1
fi

# Keep SquashFS and zsync timestamps tied to the source revision. This does not
# claim that electron-builder's complete output is reproducible byte for byte.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git -C "$script_dir" log -1 --format=%ct)}"
[[ "$SOURCE_DATE_EPOCH" =~ ^[0-9]+$ ]] || { echo 'Invalid SOURCE_DATE_EPOCH.' >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
tool="$tmp/appimagetool-x86_64.AppImage"
runtime="$tmp/runtime-x86_64"
output="$tmp/output"
mkdir "$output"

# Fixed release tags and GitHub-published SHA-256 digests. A changed upstream
# artifact fails closed rather than silently changing our release runtime.
curl --fail --location --silent --show-error --retry 3 \
  'https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage' \
  --output "$tool"
curl --fail --location --silent --show-error --retry 3 \
  'https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64' \
  --output "$runtime"
printf '%s  %s\n' \
  'ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0' "$tool" \
  '2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d' "$runtime" \
  | sha256sum --check --status
chmod +x "$tool" "$runtime"

if readelf -l "$runtime" | grep -F 'INTERP' >/dev/null; then
  echo 'The replacement AppImage runtime unexpectedly needs a dynamic loader.' >&2
  exit 1
fi

(cd "$tmp" && "$appimage" --appimage-extract >/dev/null)
if [[ ! -f "$tmp/squashfs-root/AppRun" ]]; then
  echo 'The original AppImage did not extract to a valid AppDir.' >&2
  exit 1
fi

args=(--runtime-file "$runtime" --comp gzip --file-url "$name")
if [[ "$update_channel" == stable ]]; then
  update_info='gh-releases-zsync|Binah-Dev|cf-compass|latest|CF-Compass-*-x86_64.AppImage.zsync'
  if ! command -v zsyncmake >/dev/null || ! command -v zsync >/dev/null; then
    echo 'Stable releases require zsyncmake and zsync to create and verify the update sidecar.' >&2
    exit 1
  fi
  args+=(-u "$update_info")
fi

ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$tool" \
  "${args[@]}" "$tmp/squashfs-root" "$output/$name"
chmod +x "$output/$name"
touch --date="@$SOURCE_DATE_EPOCH" "$output/$name"

if readelf -l "$output/$name" | grep -F 'INTERP' >/dev/null; then
  echo 'The repacked AppImage still has a dynamically linked runtime.' >&2
  exit 1
fi
if [[ "$update_channel" == stable ]]; then
  # Regenerate after normalizing mtime, and make the URL explicitly relative to
  # the release sidecar (never a temporary build path).
  zsyncmake -u "$name" -o "$output/$name.zsync" "$output/$name"
  actual_update_info="$("$output/$name" --appimage-updateinformation)"
  if [[ "$actual_update_info" != "$update_info" || ! -s "$output/$name.zsync" ]]; then
    echo 'AppImage update information or the .zsync sidecar is missing.' >&2
    exit 1
  fi
fi
node "$script_dir/verify-appimage.mjs" "$output" "--update-channel=$update_channel"
if [[ "$update_channel" == stable ]]; then
  mkdir "$tmp/zsync-check"
  # A complete local seed must reconstruct without downloading any data. This
  # also exercises the block checksums rather than only trusting the header.
  zsync -i "$output/$name" -o "$tmp/zsync-check/$name" "$output/$name.zsync"
  cmp -- "$output/$name" "$tmp/zsync-check/$name"
fi

# Replace the original only after the runtime and update metadata pass checks.
mv -f -- "$output/$name" "$appimage"
if [[ "$update_channel" == stable ]]; then
  mv -f -- "$output/$name.zsync" "$release_dir/$name.zsync"
fi
echo "Verified repacked AppImage: $appimage"
