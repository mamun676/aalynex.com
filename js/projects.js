// ════════════════════════════════════
//  PROJECTS — multi-file upload draft helpers
// ════════════════════════════════════
async function handleMultiFileUpload(input) {
  if (!input.files || input.files.length === 0) return;
  const files = Array.from(input.files);

  for (const file of files) {
    let duration = null;
    let type = file.type.split('/')[0]; // 'video', 'audio', 'image'

    if (type === 'video' || type === 'audio') {
      duration = await getMediaDuration(file);
    }

    newProjectFiles.push({
      file: file,
      name: file.name,
      size: file.size,
      type: type,
      duration: duration
    });
  }
  renderFileListPreview();
}

function getMediaDuration(file) {
  return new Promise((resolve) => {
    const media = document.createElement(file.type.split('/')[0] === 'video' ? 'video' : 'audio');
    media.preload = 'metadata';
    media.onloadedmetadata = function () {
      window.URL.revokeObjectURL(media.src);
      const minutes = Math.floor(media.duration / 60);
      const seconds = Math.floor(media.duration % 60);
      resolve(`${minutes}:${seconds < 10 ? '0' : ''}${seconds} mins`);
    };
    media.src = URL.createObjectURL(file);
  });
}

function renderFileListPreview() {
  const list = document.getElementById('file-list-preview');
  if (!list) return;
  if (newProjectFiles.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = newProjectFiles.map((f, i) => {
    let icon = '📄';
    if (f.type === 'video') icon = '🎬';
    else if (f.type === 'image') icon = '🖼️';
    else if (f.type === 'audio') icon = '🎵';

    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--surface);border:1px solid var(--glass-border);border-radius:var(--radius-sm);">
      <div style="display:flex;align-items:center;gap:10px;min-width:0;">
        <span style="font-size:1.2rem;">${icon}</span>
        <div style="min-width:0;flex:1;">
          <div style="font-size:.85rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;">${f.name}</div>
          <div style="font-size:.7rem;color:var(--text-3);">${fmtFileSize(f.size)} ${f.duration ? `• ⏱ ${f.duration}` : ''}</div>
        </div>
      </div>
      <button class="btn btn-danger btn-xs" style="border:none;" onclick="removeDraftFile(${i})">X</button>
    </div>`;
  }).join('');
}

function removeDraftFile(index) {
  newProjectFiles.splice(index, 1);
  renderFileListPreview();
}