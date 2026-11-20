const STORAGE_KEY = 'studydesk_html_session_v1';
// Leave empty when frontend and server.js run together.
// If hosting only the frontend on GitHub Pages, set this to your deployed Node.js backend URL (e.g. 'https://your-app.onrender.com').
const API_BASE = '';

function getEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el;
}

function loadSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const saved = loadSession();

const savedNotes =
  saved?.notes && typeof saved.notes === 'object' && !Array.isArray(saved.notes)
    ? saved.notes
    : null;

const savedFlashcards = Array.isArray(saved?.flashcards)
  ? saved.flashcards.filter((card) => Boolean(card && typeof card === 'object' && typeof card.front === 'string'))
  : [];

const state = {
  mode: 'notes',
  topic: typeof saved?.topic === 'string' ? saved.topic : '',
  sourceNotes: typeof saved?.sourceNotes === 'string' ? saved.sourceNotes : '',
  files: [],
  notes: savedNotes,
  flashcards: savedFlashcards,
  currentIndex: 0,
  isFlipped: false,
  showHint: false,
  masteredIds: saved?.mastered && typeof saved.mastered === 'object' ? saved.mastered : {},
  reviewIds: saved?.review && typeof saved.review === 'object' ? saved.review : {},
  isLoadingNotes: false,
  isLoadingCards: false,
  error: null,
};

function saveSession() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        topic: state.topic,
        sourceNotes: state.sourceNotes,
        notes: state.notes,
        flashcards: state.flashcards,
        mastered: state.masteredIds,
        review: state.reviewIds,
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function hasStudyInput() {
  return Boolean(state.topic.trim() || state.sourceNotes.trim() || state.files.length > 0);
}

const topicInput = getEl('study-topic');
const notesInput = getEl('source-notes');
const filesInput = getEl('study-files');
const generateBtn = getEl('generate-btn');
const emptyNotesBtn = getEl('empty-notes-btn');
const emptyCardsBtn = getEl('empty-cards-btn');
const regenNotesBtn = getEl('regen-notes-btn');
const regenCardsBtn = getEl('regen-cards-btn');
const modeButtons = document.querySelectorAll('[data-mode]');

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMimeType(file) {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeMap = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function renderFileList() {
  const list = getEl('file-list');
  list.hidden = state.files.length === 0;
  list.replaceChildren();

  state.files.forEach((file, index) => {
    const item = createElement('li', 'file-item');
    const info = createElement('div', 'file-info');
    info.append(
      createElement('span', 'file-name', file.name),
      createElement('span', 'file-size tabular-nums', formatFileSize(file.size))
    );

    const removeBtn = createElement('button', 'file-remove-btn', 'Remove');
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', () => {
      state.files.splice(index, 1);
      render();
    });

    item.append(info, removeBtn);
    list.appendChild(item);
  });
}

function render() {
  const ready = hasStudyInput();
  const busy = state.isLoadingNotes || state.isLoadingCards;

  generateBtn.disabled = busy || !ready;
  generateBtn.textContent = busy
    ? 'Generating...'
    : state.mode === 'flashcards'
      ? 'Generate Flashcards'
      : 'Generate Study Notes';

  emptyNotesBtn.disabled = busy || !ready;
  emptyCardsBtn.disabled = busy || !ready;
  regenNotesBtn.disabled = busy || !ready;
  regenCardsBtn.disabled = busy || !ready;

  const errorBanner = getEl('error-banner');
  errorBanner.hidden = !state.error;
  if (state.error) {
    getEl('error-text').textContent = state.error;
  }

  modeButtons.forEach((button) => {
    const isActive = button.getAttribute('data-mode') === state.mode;
    button.classList.toggle('is-active', isActive);
    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });

  getEl('notes-panel').hidden = state.mode !== 'notes';
  getEl('flashcards-panel').hidden = state.mode !== 'flashcards';

  renderFileList();
  renderNotes();
  renderFlashcards();
}

function renderNotes() {
  getEl('notes-loading').hidden = !state.isLoadingNotes;
  getEl('notes-empty').hidden = state.isLoadingNotes || Boolean(state.notes);
  getEl('notes-content').hidden = state.isLoadingNotes || !state.notes;

  if (state.isLoadingNotes || !state.notes) return;

  const notes = state.notes;
  const concepts = Array.isArray(notes.keyConcepts) ? notes.keyConcepts : [];

  getEl('notes-meta').textContent =
    `${notes.subject || 'General'} · ${concepts.length} Key Concepts`;
  getEl('notes-title').textContent = notes.topicTitle || 'Study Notes';
  getEl('notes-overview').textContent = notes.overview || '';

  const conceptsContainer = getEl('notes-concepts');
  conceptsContainer.replaceChildren();

  concepts.forEach((concept, index) => {
    const item = createElement('div', 'concept-item');
    const title = createElement('h4', 'concept-title');
    title.append(
      createElement('span', 'concept-index', `${String(index + 1).padStart(2, '0')}.`),
      concept?.title || ''
    );

    const example = createElement('div', 'example-box');
    example.append(createElement('strong', '', 'Example: '), concept?.example || '');

    item.append(title, createElement('p', 'prose', concept?.explanation || ''), example);
    conceptsContainer.appendChild(item);
  });

  const mistakes = Array.isArray(notes.commonMistakes) ? notes.commonMistakes : [];
  getEl('notes-mistakes').replaceChildren(
    ...mistakes.map((mistake) => createElement('li', '', String(mistake)))
  );

  const takeaways = Array.isArray(notes.takeaways) ? notes.takeaways : [];
  getEl('notes-takeaways').replaceChildren(
    ...takeaways.map((takeaway) => createElement('li', '', String(takeaway)))
  );
}

function renderFlashcards() {
  const total = state.flashcards.length;
  getEl('flashcards-loading').hidden = !state.isLoadingCards;
  getEl('flashcards-empty').hidden = state.isLoadingCards || total > 0;
  getEl('flashcards-content').hidden = state.isLoadingCards || total === 0;

  if (state.isLoadingCards || total === 0) return;

  if (state.currentIndex >= total) state.currentIndex = 0;

  const card = state.flashcards[state.currentIndex];
  const masteredCount = Object.values(state.masteredIds).filter(Boolean).length;
  const reviewCount = Object.values(state.reviewIds).filter(Boolean).length;

  getEl('cards-meta').textContent =
    `Card ${state.currentIndex + 1} of ${total} · ${masteredCount} Mastered · ${reviewCount} Needs Review`;

  const progress = Math.round(((state.currentIndex + 1) / total) * 100);
  getEl('cards-progress').style.width = `${progress}%`;

  const cardElement = getEl('flashcard-el');
  cardElement.classList.toggle('is-flipped', state.isFlipped);
  cardElement.setAttribute('aria-pressed', String(state.isFlipped));

  getEl('card-front-text').textContent = card.front || '';
  getEl('card-back-text').textContent = card.back || '';
  getEl('card-back-index').textContent = `Card ${state.currentIndex + 1}`;

  const isMastered = Boolean(state.masteredIds[card.id]);
  const isReview = Boolean(state.reviewIds[card.id]);
  const statusEl = getEl('card-status');
  statusEl.className = `card-status${isMastered ? ' is-mastered' : isReview ? ' is-review' : ''}`;
  statusEl.textContent = isMastered ? 'Mastered' : isReview ? 'Needs Review' : '';

  const hintBox = getEl('card-hint-box');
  hintBox.hidden = !(state.showHint && !state.isFlipped);
  hintBox.textContent = card.hint ? `Hint: ${card.hint}` : 'No hint available.';

  const hintBtn = getEl('hint-btn');
  hintBtn.hidden = state.isFlipped;
  hintBtn.textContent = state.showHint ? 'Hide Hint' : 'Show Hint';

  getEl('prev-btn').disabled = state.currentIndex === 0;
  getEl('next-btn').disabled = state.currentIndex === total - 1;
  getEl('review-btn').classList.toggle('is-active-warning', isReview);
}

async function fetchStudyData(type) {
  if (!hasStudyInput() || state.isLoadingNotes || state.isLoadingCards) return;

  state.error = null;
  if (type === 'notes') state.isLoadingNotes = true;
  if (type === 'flashcards') state.isLoadingCards = true;
  render();

  try {
    const apiBase = API_BASE.replace(/\/+$/, '');
    const response = await fetch(`${apiBase}/api/study/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: state.topic,
        sourceNotes: state.sourceNotes,
        files: state.files.map(({ name, mimeType, data, isText }) => ({ name, mimeType, data, isText })),
      }),
    });

    const rawBody = await response.text();
    let data = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      if (response.status === 404 || response.status === 405) {
        throw new Error(
          'Backend API not found. GitHub Pages only hosts static files — deploy server.js on a Node.js host (like Render or Railway) and set API_BASE in app.js.'
        );
      }
      throw new Error(`Server error (${response.status}). Please try again.`);
    }

    if (!response.ok || !data[type]) {
      throw new Error(data.error || `Could not generate ${type}.`);
    }

    if (type === 'notes' && data.notes) {
      state.notes = data.notes;
    } else if (type === 'flashcards' && Array.isArray(data.flashcards)) {
      state.flashcards = data.flashcards;
      state.currentIndex = 0;
      state.isFlipped = false;
      state.showHint = false;
      state.masteredIds = {};
      state.reviewIds = {};
    }
    saveSession();
  } catch (err) {
    state.error = err instanceof Error ? err.message : `Could not generate ${type}.`;
  } finally {
    state.isLoadingNotes = false;
    state.isLoadingCards = false;
    render();
  }
}

function goToCard(index) {
  state.currentIndex = index;
  state.isFlipped = false;
  state.showHint = false;
  renderFlashcards();
}

function markCard(status) {
  const card = state.flashcards[state.currentIndex];
  if (!card) return;
  state.masteredIds[card.id] = status === 'mastered';
  state.reviewIds[card.id] = status === 'review';
  saveSession();

  if (state.currentIndex < state.flashcards.length - 1) {
    goToCard(state.currentIndex + 1);
  } else {
    renderFlashcards();
  }
}

function toggleCardFlip() {
  state.isFlipped = !state.isFlipped;
  renderFlashcards();
}

function readUploadedFile(file) {
  return new Promise((resolve, reject) => {
    const isText = file.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const result = String(reader.result || '');
      const data = isText ? result : result.split(',')[1] || '';
      const mimeType = getMimeType(file);
      resolve({ name: file.name, mimeType, size: file.size, data, isText });
    };
    if (isText) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  });
}

// Initialize inputs and view
topicInput.value = state.topic;
notesInput.value = state.sourceNotes;
render();

// Event listeners
topicInput.addEventListener('input', () => {
  state.topic = topicInput.value;
  saveSession();
  render();
});

notesInput.addEventListener('input', () => {
  state.sourceNotes = notesInput.value;
  saveSession();
  render();
});

filesInput.addEventListener('change', async () => {
  const selected = Array.from(filesInput.files || []);
  filesInput.value = '';
  if (selected.length === 0) return;

  if (state.files.length + selected.length > 5) {
    state.error = 'You can attach up to 5 files at a time.';
    render();
    return;
  }

  for (const file of selected) {
    if (file.size === 0) {
      state.error = `${file.name} is empty.`;
      render();
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      state.error = `${file.name} exceeds the 10 MB file size limit.`;
      render();
      return;
    }
    const isSupported =
      file.type.startsWith('text/') ||
      file.type.startsWith('image/') ||
      file.type === 'application/pdf' ||
      /\.(pdf|txt|md|csv|png|jpe?g|webp|gif)$/i.test(file.name);
    if (!isSupported) {
      state.error = `${file.name} is not a supported file type. Please upload PDF, text, Markdown, CSV, or image files.`;
      render();
      return;
    }
  }

  try {
    state.error = null;
    const loaded = await Promise.all(selected.map(readUploadedFile));
    state.files.push(...loaded);
  } catch (err) {
    state.error = err instanceof Error ? err.message : 'Could not read selected file.';
  }
  render();
});

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.getAttribute('data-mode');
    if (mode === 'notes' || mode === 'flashcards') {
      state.mode = mode;
      render();
    }
  });
});

getEl('brand-link').addEventListener('click', (e) => {
  e.preventDefault();
  state.mode = 'notes';
  render();
});

getEl('study-form').addEventListener('submit', (e) => {
  e.preventDefault();
  fetchStudyData(state.mode);
});

emptyNotesBtn.addEventListener('click', () => fetchStudyData('notes'));
regenNotesBtn.addEventListener('click', () => fetchStudyData('notes'));
emptyCardsBtn.addEventListener('click', () => fetchStudyData('flashcards'));
regenCardsBtn.addEventListener('click', () => fetchStudyData('flashcards'));

getEl('goto-cards-btn').addEventListener('click', () => {
  state.mode = 'flashcards';
  render();
  if (state.flashcards.length === 0 && hasStudyInput() && !state.isLoadingCards) {
    fetchStudyData('flashcards');
  }
});

getEl('dismiss-error-btn').addEventListener('click', () => {
  state.error = null;
  render();
});

getEl('copy-notes-btn').addEventListener('click', async () => {
  if (!state.notes) return;
  const n = state.notes;
  const markdown = [
    `# ${n.topicTitle || 'Study Notes'}`,
    `Subject: ${n.subject || 'General'}`,
    '',
    '## Overview',
    n.overview || '',
    '',
    '## Key Concepts',
    ...(n.keyConcepts || []).flatMap((c, i) => [
      `### ${i + 1}. ${c?.title || ''}`,
      c?.explanation || '',
      `Example: ${c?.example || ''}`,
      '',
    ]),
    '## Common Mistakes to Avoid',
    ...(n.commonMistakes || []).map((m) => `- ${m}`),
    '',
    '## Quick Takeaways',
    ...(n.takeaways || []).map((t) => `- ${t}`),
  ].join('\n');

  try {
    await navigator.clipboard.writeText(markdown);
    const btn = getEl('copy-notes-btn');
    btn.textContent = 'Copied';
    setTimeout(() => {
      btn.textContent = 'Copy Notes';
    }, 2000);
  } catch {
    state.error = 'Could not copy to clipboard in this browser.';
    render();
  }
});

getEl('flashcard-el').addEventListener('click', toggleCardFlip);
getEl('flashcard-el').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    toggleCardFlip();
  }
});

getEl('prev-btn').addEventListener('click', () => {
  if (state.currentIndex > 0) goToCard(state.currentIndex - 1);
});

getEl('next-btn').addEventListener('click', () => {
  if (state.currentIndex < state.flashcards.length - 1) goToCard(state.currentIndex + 1);
});

getEl('hint-btn').addEventListener('click', () => {
  state.showHint = !state.showHint;
  renderFlashcards();
});

getEl('mastered-btn').addEventListener('click', () => markCard('mastered'));
getEl('review-btn').addEventListener('click', () => markCard('review'));

getEl('shuffle-btn').addEventListener('click', () => {
  const copy = [...state.flashcards];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  state.flashcards = copy;
  saveSession();
  goToCard(0);
});

getEl('reset-btn').addEventListener('click', () => {
  state.topic = '';
  state.sourceNotes = '';
  state.files = [];
  state.notes = null;
  state.flashcards = [];
  state.currentIndex = 0;
  state.isFlipped = false;
  state.showHint = false;
  state.masteredIds = {};
  state.reviewIds = {};
  state.error = null;
  state.mode = 'notes';

  topicInput.value = '';
  notesInput.value = '';
  filesInput.value = '';
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
  render();
});

window.addEventListener('keydown', (e) => {
  if (state.mode !== 'flashcards' || state.flashcards.length === 0) return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A' || tag === 'SELECT') {
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    toggleCardFlip();
  } else if (e.key === 'ArrowRight' && state.currentIndex < state.flashcards.length - 1) {
    goToCard(state.currentIndex + 1);
  } else if (e.key === 'ArrowLeft' && state.currentIndex > 0) {
    goToCard(state.currentIndex - 1);
  }
});
