// ═══════════════════════════════════════════════
//  DB — in-memory database handler + global state
// ═══════════════════════════════════════════════
const MemDB = { users: [], projects: [], msgs: {}, attachments: [], currentUser: null };

const DB = {
  users()               { return MemDB.users; },
  saveUsers(data)       { MemDB.users = data; },
  projects()            { return MemDB.projects; },
  saveProjects(data)    { MemDB.projects = data; },
  messages()            { return MemDB.msgs; },
  saveMessages(data)    { MemDB.msgs = data; },
  attachments()         { return MemDB.attachments; },
  saveAttachments(data) { MemDB.attachments = data; },

  currentUser()         { return MemDB.currentUser || null; },
  setCurrentUser(data)  { MemDB.currentUser = data; },
  logout() {
    MemDB.currentUser = null;
    MemDB.users       = [];
    MemDB.projects    = [];
    MemDB.msgs        = {};
    MemDB.attachments = [];
  }
};

/* ── GLOBAL STATE ── */
let CU = null;
let wfStep = 0, selContent = '', selFreelancerName = null;
let selFreelancerIds = [];
let activeManageProjectId = null;
let newProjectDraft = {};
let newProjectFiles = []; // Track uploaded files before submitting
let currentChatUserId = null;
let onlineUsers = new Set();
let _signupOtpData = {};
let currentChatChannel = null;
let currentConversationId = null;
const renderedMessageIds = new Set();
let isSubscribing = false;
let _wfPosting = false;
let currentCreatorPage = 'home';    // ← realtime/back-router current page tracking
let currentFreelancerPage = 'home';