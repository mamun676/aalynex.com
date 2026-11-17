// Bind a project's final upload to its own watermarked preview (not the first in chat).
// Pure helper shared by rendering, checkout preflight, and automated tests.
const axDeliveryRevision = (() => {
  const marker = /\s*\[AXPV:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\]\s*$/i;
  const validId = value => typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const cleanText = value => String(value || '').replace(marker, '').trim();
  const previewId = value => String(value || '').match(marker)?.[1] || null;
  const scoped = (message, project, kind) =>
    typeof message?.file_url === 'string' && !!project?.id &&
    message.file_url.includes('/projects/' + String(project.id) + '/' + kind + '/');
  const isFinal = (message, project) => scoped(message, project, 'final') &&
    String(message.from) === String(project.freelancerId) &&
    /^Final Delivery(?:\s|:|$)/i.test(String(message.text || ''));
  const isPreview = (message, project) => scoped(message, project, 'preview') &&
    String(message.from) === String(project.freelancerId) &&
    /^Project Preview:/i.test(String(message.text || ''));
  const ordered = messages => (Array.isArray(messages) ? messages.slice() : [])
    .filter(x => x && x.id)
    .sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0) ||
      String(a.id).localeCompare(String(b.id)));
  function pairs(messages, project) {
    if (!project?.id || !project?.freelancerId) return [];
    const stream = ordered(messages);
    let previousFinalIndex = -1;
    const results = [];
    for (let i = 0; i < stream.length; i++) {
      const current = stream[i];
      if (!isFinal(current, project)) continue;
      const candidates = stream.slice(previousFinalIndex + 1, i)
        .filter(message => isPreview(message, project));
      const explicit = previewId(current.text);
      // A declared preview must be present between this final and the previous
      // final. Never silently fall back to a wrong or older preview.
      const paired = explicit
        ? candidates.find(message => String(message.id).toLowerCase() === explicit.toLowerCase()) || null
        : candidates.length === 1 ? candidates[0] : null;
      results.push({ final: current, preview: paired, paired: !!paired,
        explicit: !!explicit, revision: results.length + 1, isLatest: false });
      previousFinalIndex = i;
    }
    if (results.length) {
      const current = results[results.length - 1];
      current.isLatest = true;
      // A new preview without its final is an incomplete newer submission.
      // Do not let the previous revision remain payable in that window.
      current.pendingNewPreview = stream.slice(previousFinalIndex + 1)
        .some(message => isPreview(message, project));
    }
    return results;
  }
  const latest = (messages, project) => {
    const list = pairs(messages, project);
    return list.length ? list[list.length - 1] : null;
  };
  const forFinal = (messages, project, messageId) =>
    pairs(messages, project).find(x => String(x.final.id) === String(messageId)) || null;
  return Object.freeze({ validId, cleanText, previewId, pairs, latest, forFinal, isPreview, isFinal });
})();
