#!/bin/bash
# Публикация сборок go-bpm-modeler на go-bpm.tech. На сервере - /opt/go-bpm-modeler/publish.sh, вызывается CI по SSH как
# forced command ключа:
#
#	command="/opt/go-bpm-modeler/publish.sh",restrict ssh-ed25519 ... go-bpm-modeler-ci
#
# Аргумент (SSH_ORIGINAL_COMMAND) - "<канал> <версия> <коммит>":
#	dev <7 знаков коммита> <коммит>   - сборка main, становится каналом dev
#	release <vX.Y.Z> <коммит>         - релиз по тегу, становится каналом latest
# stdin - tar ровно с архивами сборок всех платформ (имена - PLATFORMS ниже).
#
# Раскладка в /var/www/go-bpm-downloads/modeler (nginx: https://go-bpm.tech/downloads/modeler/):
#	builds/<сборка>/  архивы, SHA256SUMS, manifest.json; сборка - dev-<коммит> или vX.Y.Z
#	dev, latest       симлинки на сборки каналов
#	index.json        манифесты каналов - его читает страница /modeler/ сайта
set -euo pipefail

ROOT=/var/www/go-bpm-downloads/modeler
SITE=https://go-bpm.tech/downloads/modeler
REPO=https://github.com/nicolas-vp/go-bpm-modeler
KEEP_DEV=3
KEEP_RELEASE=10

# платформа сборки -> подпись
declare -A PLATFORMS=(
	[linux-amd64]="Linux x86-64"
	[linux-arm64]="Linux ARM64"
	[windows-amd64]="Windows x86-64"
	[darwin-amd64]="macOS Intel"
	[darwin-arm64]="macOS Apple Silicon"
)
# порядок на странице загрузок
ORDER=(linux-amd64 linux-arm64 windows-amd64 darwin-arm64 darwin-amd64)
archive() {
	case $1 in
	linux-*) echo "go-bpm-modeler-$1.tar.gz" ;;
	*) echo "go-bpm-modeler-$1.zip" ;;
	esac
}

fail() {
	echo "publish: $*" >&2
	exit 1
}

read -r channel version commit extra <<<"${SSH_ORIGINAL_COMMAND:-}"
[[ -z ${extra:-} && $commit =~ ^[0-9a-f]{40}$ ]] || fail "ожидается «<канал> <версия> <коммит>»: ${SSH_ORIGINAL_COMMAND:-}"
case $channel in
dev)
	[[ $version =~ ^[0-9a-f]{7}$ && $commit == "$version"* ]] || fail "версия dev - 7 знаков коммита: $version"
	name=dev-$version link=dev
	;;
release)
	[[ $version =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || fail "версия релиза - vX.Y.Z: $version"
	name=$version link=latest
	;;
*) fail "неизвестный канал: $channel" ;;
esac

mkdir -p "$ROOT/builds"
# параллельные публикации не должны перемешать симлинки и index.json
exec 9>"$ROOT/.lock"
flock 9

tmp=$(mktemp -d "$ROOT/builds/.incoming.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

# не больше 300 МБ: архивы всех платформ весят около 25 МБ
head -c 300000000 | tar -x -C "$tmp" --no-same-owner --no-same-permissions

if find "$tmp" -mindepth 1 ! -type f | grep -q .; then
	fail "в архиве есть каталоги или симлинки"
fi
expected=$(for p in "${!PLATFORMS[@]}"; do archive "$p"; done | sort)
actual=$(cd "$tmp" && ls -1 | sort)
[[ $actual == "$expected" ]] || fail "в архиве не тот набор файлов: $(echo $actual)"

files='[]'
for p in "${ORDER[@]}"; do
	file=$(archive "$p")
	size=$(stat -c %s "$tmp/$file")
	(( size > 1000000 )) || fail "$file подозрительно мал: $size байт"
	sum=$(sha256sum "$tmp/$file" | cut -d' ' -f1)
	echo "$sum  $file" >>"$tmp/SHA256SUMS"
	files=$(jq -c --arg platform "$p" --arg label "${PLATFORMS[$p]}" --arg file "$file" --argjson size "$size" \
		--arg sha256 "$sum" '. + [{platform: $platform, label: $label, file: $file, size: $size, sha256: $sha256}]' <<<"$files")
done
jq -n --arg channel "$channel" --arg version "$version" --arg commit "$commit" --arg build "$name" \
	--arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg url "$SITE/builds/$name/" \
	--arg commitUrl "$REPO/commit/$commit" --argjson files "$files" \
	'{channel: $channel, version: $version, commit: $commit, commitUrl: $commitUrl, build: $build, date: $date,
	  url: $url, files: $files}' >"$tmp/manifest.json"

chmod -R u=rwX,go=rX "$tmp"
# повторная публикация той же сборки (перезапуск CI) заменяет её
rm -rf "$ROOT/builds/$name"
mv "$tmp" "$ROOT/builds/$name"
trap - EXIT
ln -sfn "builds/$name" "$ROOT/$link.new"
mv -T "$ROOT/$link.new" "$ROOT/$link"
echo "publish: $channel -> builds/$name"

# index.json - манифесты обоих каналов, null - канала ещё нет
manifest() { if [[ -f $ROOT/$1/manifest.json ]]; then cat "$ROOT/$1/manifest.json"; else echo null; fi; }
jq -n --argjson latest "$(manifest latest)" --argjson dev "$(manifest dev)" '{latest: $latest, dev: $dev}' \
	>"$ROOT/index.json.new"
chmod 644 "$ROOT/index.json.new"
mv "$ROOT/index.json.new" "$ROOT/index.json"

# старые сборки: последние KEEP_DEV dev и KEEP_RELEASE релизов, сборки каналов не трогаем
current=$(readlink "$ROOT/dev" "$ROOT/latest" 2>/dev/null | xargs -rn1 basename || true)
prune() {
	# сборок с таким префиксом может не быть: ls падает, а pipefail уронил бы весь скрипт
	{ ls -1dt "$ROOT"/builds/$1/ 2>/dev/null || true; } | tail -n +$(($2 + 1)) | while read -r dir; do
		grep -qx "$(basename "$dir")" <<<"$current" || rm -rf "$dir"
	done
}
prune 'dev-*' $KEEP_DEV
prune 'v*' $KEEP_RELEASE

# nginx отдаёт именно новую сборку
if ! curl -sf --resolve go-bpm.tech:443:127.0.0.1 "$SITE/$link/manifest.json" | cmp -s - "$ROOT/builds/$name/manifest.json"; then
	fail "nginx не отдаёт новый манифест $link"
fi
echo "publish: готово, $SITE/$link/"
