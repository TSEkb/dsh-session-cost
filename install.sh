#!/usr/bin/env bash
# Link this repo's plugin packages into a DSH profile and sync its patch layer.
#
# Idempotent: run it after `git pull` on any machine. It only rewrites the
# profile's dependency entry, bundle list, and one marked block of its patch
# file — everything else in the profile stays untouched.
#
# Usage:
#   ./install.sh            # install / update
#   ./install.sh --check    # report what would change, write nothing
#
# Profile: $DSH_PROFILE (default: web), directory $DSH_PROFILE_DIR
# (default: $HOME/.dsh/profiles/$DSH_PROFILE).

set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
profile="${DSH_PROFILE:-web}"
profile_dir="${DSH_PROFILE_DIR:-$HOME/.dsh/profiles/$profile}"
mode="${1:-apply}"

if [ ! -d "$profile_dir" ]; then
  echo "нет профиля: $profile_dir" >&2
  echo "запустите DSH хотя бы раз или задайте DSH_PROFILE_DIR" >&2
  exit 1
fi

# Every top-level directory whose manifest declares dsh.bundle is a plugin.
packages=()
for dir in "$root"/*/; do
  [ -f "${dir}package.json" ] || continue
  grep -q '"bundle"' "${dir}package.json" || continue
  packages+=("${dir%/}")
done

if [ "${#packages[@]}" -eq 0 ]; then
  echo "в $root нет пакетов с dsh.bundle" >&2
  exit 1
fi

echo "профиль: $profile_dir"

for dir in "${packages[@]}"; do
  if ! name="$(node -e '
    const m = require(process.argv[1])
    if (!m.name || !m.dsh || !m.dsh.bundle) process.exit(1)
    process.stdout.write(m.name)
  ' "$dir/package.json")"; then
    echo "пропускаю $dir: в package.json нет name или dsh.bundle" >&2
    continue
  fi
  echo "→ $name  →  $dir"
  [ "$mode" = "--check" ] && continue

  # Node resolves a package by name from the profile directory, so a symlink
  # keeps the checkout as the single source of truth.
  mkdir -p "$(dirname "$profile_dir/node_modules/$name")"
  ln -sfn "$dir" "$profile_dir/node_modules/$name"

  node - "$profile_dir" "$name" "$dir" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [profileDir, name, dir] = process.argv.slice(2)
const file = path.join(profileDir, 'package.json')
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
manifest.dependencies = manifest.dependencies ?? {}
manifest.dependencies[name] = `link:${dir}`
manifest.dsh = manifest.dsh ?? {}
manifest.dsh.profile = manifest.dsh.profile ?? {}
manifest.dsh.profile.bundles = manifest.dsh.profile.bundles ?? []
if (!manifest.dsh.profile.bundles.includes(name)) manifest.dsh.profile.bundles.push(name)
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
NODE
done

# The patch layer is versioned here, so a new machine gets the same config.
if [ -f "$root/profile/cordis.patch.yml" ]; then
  if [ "$mode" = "--check" ]; then
    echo "→ обновил бы блок dsh-local-plugins в $profile_dir/cordis.patch.yml"
  else
    node - "$profile_dir" "$root/profile/cordis.patch.yml" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [profileDir, source] = process.argv.slice(2)
const target = path.join(profileDir, 'cordis.patch.yml')
const start = '# >>> dsh-local-plugins'
const end = '# <<< dsh-local-plugins'
const body = fs
  .readFileSync(source, 'utf8')
  .split('\n')
  .filter((line) => !/^#\s*(>>>|<<<)\s*dsh-local-plugins/.test(line))
  .join('\n')
  .trimEnd()
const block = `${start}\n${body}\n${end}`
const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
// Drop the previous managed block (markers or a half-written one), keep the rest.
let stripped = current
for (;;) {
  const from = stripped.indexOf(start)
  if (from < 0) break
  const to = stripped.indexOf(end, from)
  stripped = stripped.slice(0, from) + (to >= 0 ? stripped.slice(to + end.length) : '')
  if (to < 0) break
}
stripped = stripped.trimEnd()
const next = `${stripped === '' ? '' : `${stripped}\n`}${block}\n`
if (next === current) {
  console.log(`   блок в ${target} уже актуален`)
} else {
  if (current !== '') fs.writeFileSync(`${target}.bak`, current)
  fs.writeFileSync(target, next)
  console.log(`   блок записан в ${target} (бэкап: ${path.basename(target)}.bak)`)
}
NODE
  fi
fi

echo
if [ "$mode" = "--check" ]; then
  echo "проверка: ничего не записано"
else
  echo "готово. перезапустите GUI, чтобы Loader собрал новое дерево:"
  echo "  dsh web"
fi
