const clock = (seconds) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
};

document.querySelectorAll("[data-player]").forEach((player) => {
  const media = player.querySelector("[data-player-media]");
  const toggle = player.querySelector("[data-player-toggle]");
  const glyph = player.querySelector("[data-player-glyph]");
  const track = player.querySelector("[data-player-track]");
  const fill = player.querySelector("[data-player-fill]");
  const time = player.querySelector("[data-player-time]");
  if (!media || !toggle || !glyph || !track || !fill || !time) return;

  media.removeAttribute("controls");

  const update = () => {
    const duration = Number.isFinite(media.duration) ? media.duration : 0;
    const current = Number.isFinite(media.currentTime) ? media.currentTime : 0;
    const ratio = duration ? current / duration : 0;
    fill.style.width = `${ratio * 100}%`;
    time.textContent = `${clock(current)} / ${clock(duration)}`;
    track.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
  };

  const updateState = () => {
    const playing = !media.paused && !media.ended;
    glyph.className = playing ? "glyph-pause" : "glyph-play";
    toggle.setAttribute(
      "aria-label",
      `${playing ? "Пауза" : "Играть"} — ${toggle.getAttribute("aria-label")?.split("—").at(-1)?.trim() ?? "медиа"}`,
    );
  };

  const togglePlayback = async () => {
    if (media.paused) {
      try { await media.play(); } catch { return; }
    } else {
      media.pause();
    }
    updateState();
  };

  const seek = (ratio) => {
    if (!Number.isFinite(media.duration)) return;
    media.currentTime = Math.max(0, Math.min(1, ratio)) * media.duration;
  };

  toggle.addEventListener("click", togglePlayback);
  if (media instanceof HTMLVideoElement) media.addEventListener("click", togglePlayback);
  track.addEventListener("click", (event) => {
    const box = track.getBoundingClientRect();
    seek((event.clientX - box.left) / box.width);
  });
  track.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 5 : -5;
    if (Number.isFinite(media.duration)) {
      media.currentTime = Math.max(0, Math.min(media.duration, media.currentTime + step));
    }
  });
  media.addEventListener("loadedmetadata", update);
  media.addEventListener("timeupdate", update);
  media.addEventListener("play", updateState);
  media.addEventListener("pause", updateState);
  media.addEventListener("ended", updateState);
  update();
  updateState();
});

const shortWords = /(?<![\p{L}\p{N}])(а|в|во|и|к|ко|о|об|с|со|у|на|по|за|из|от|до|для|над|под|при|про|без)\s+(?=[\p{L}\p{N}«„“])/giu;
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
  acceptNode(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest("script, style, code, pre")) return NodeFilter.FILTER_REJECT;
    return (node.nodeValue ?? "").trim()
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_REJECT;
  },
});
const nodes = [];
while (walker.nextNode()) nodes.push(walker.currentNode);
nodes.forEach((node) => {
  node.nodeValue = (node.nodeValue ?? "").replace(shortWords, "$1\u00a0");
});
