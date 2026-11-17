// UI-only rendering for a freelancer's own final delivery.
// Media URLs are never embedded here: existing server-authorized actions
// create signed URLs when the user clicks a button.
function axFinalOriginalName(fileKey) {
  const key = typeof fileKey === 'string' ? fileKey : '';
  const match = key.match(/\/final\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)$/i);
  if (!match) return 'Original final video';
  const name = match[1].replace(/[\/\\\u0000-\u001f]/g, '').trim();
  return name.slice(0, 160) || 'Original final video';
}

function axEditorFinalCard(message, project, revision, preview, containerId) {
  if (!message?.id || !project?.id || !revision?.final ||
      String(revision.final.id) !== String(message.id)) return '';

  const old = !revision.isLatest;
  const pending = !old && revision.pendingNewPreview === true;
  const state = old ? 'replaced' : pending ? 'pending' : 'latest';
  const stateLabel = old ? 'REPLACED' : pending ? 'NEXT REVISION PENDING' : 'LATEST';
  const heading = old ? 'Earlier final delivery'
    : pending ? 'Final sent · newer preview pending' : 'Final video delivered';
  const sourceName = axFinalOriginalName(message.file_url);
  const note = axDeliveryRevision.cleanText(message.text)
    .replace(/^Final Delivery\s*:?\s*/i, '').trim();
  const status = old
    ? 'A newer final replaced this version. No approval or checkout on old uploads.'
    : pending
      ? 'A newer watermarked preview is waiting for its matching final video.'
      : preview
        ? 'Matching watermarked preview is ready for the creator.'
        : 'Matching preview needs verification.';
  const showActions = !old && !pending;
  const previewButton = preview
    ? '<button type="button" class="btn ax-editor-delivery-btn ax-editor-delivery-btn-preview" data-app-click="' +
      appEvent('axOpenMessageMedia', [String(preview.id), String(containerId)]) +
      '">▶ View preview</button>'
    : '<button type="button" class="btn ax-editor-delivery-btn ax-editor-delivery-btn-preview" disabled aria-disabled="true" title="No matched preview for this delivery">▶ Preview pending</button>';
  const fileButton = '<button type="button" class="btn ax-editor-delivery-btn ax-editor-delivery-btn-original" data-app-click="' +
    appEvent('axDownloadMessageFile', [String(message.id)]) + '">⬇ My original</button>';
  return '<div class="ax-editor-delivery-row">' +
    '<article class="ax-editor-delivery ax-editor-delivery--' + state + '" aria-label="' +
      escapeHtml('Revision ' + revision.revision + ': ' + heading) + '">' +
      '<div class="ax-editor-delivery-header">' +
        '<span class="ax-editor-delivery-icon" aria-hidden="true">' + (old ? '↺' : '✓') + '</span>' +
        '<div class="ax-editor-delivery-heading"><strong>' + escapeHtml(heading) + '</strong>' +
          '<span>Revision ' + escapeHtml(String(revision.revision)) + ' · Project delivery</span></div>' +
        '<span class="ax-editor-delivery-badge">' + escapeHtml(stateLabel) + '</span>' +
      '</div>' +
      '<div class="ax-editor-delivery-project">' + escapeHtml(project.title || 'Your project') + '</div>' +
      '<div class="ax-editor-delivery-file" title="' + escapeHtml(sourceName) + '">🎞 ' + escapeHtml(sourceName) + '</div>' +
      (note ? '<div class="ax-editor-delivery-note">Note: ' + escapeHtml(note) + '</div>' : '') +
      '<div class="ax-editor-delivery-status">' +
        '<span class="ax-editor-delivery-status-dot" aria-hidden="true"></span>' +
        '<span>' + escapeHtml(status) + '</span></div>' +
      '<div id="' + escapeHtml(String(containerId)) + '" class="ax-editor-delivery-player"></div>' +
      (showActions ? '<div class="ax-editor-delivery-actions">' +
        previewButton + fileButton + '</div>' : '') +
      '<div class="ax-editor-delivery-footer"><span>' +
        escapeHtml(old ? 'Previous upload' : 'Sent to creator') + '</span><span>' +
        escapeHtml(fmtTime(message.time)) + '</span></div>' +
    '</article></div>';
}
