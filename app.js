const SUPABASE_URL = 'https://pfrdajeqzlendojpwazl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ProqLjfVvB2XD5kCZN5pjQ_nlm0lsvg';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let currentCategory = 'Tutte'; 
let userLikes = new Set();
let userSaved = new Set(); // Set di ID discussioni salvate dall'utente

const appEl = document.getElementById('app');
const navActionsEl = document.getElementById('nav-actions');

function formatDate(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});
}

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}

function getHeartSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>`;
}

function getBookmarkSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>`;
}

async function refreshUserData() {
    userLikes.clear();
    userSaved.clear();
    if (!currentUser) return;

    const [likesRes, savedRes] = await Promise.all([
        supabaseClient.from('likes').select('discussion_id').eq('user_id', currentUser.id),
        supabaseClient.from('saved_discussions').select('discussion_id').eq('user_id', currentUser.id)
    ]);

    if (likesRes.data) {
        likesRes.data.forEach(like => userLikes.add(like.discussion_id));
    }
    if (savedRes.data) {
        savedRes.data.forEach(saved => userSaved.add(saved.discussion_id));
    }
}

window.toggleLike = async function(discussionId, event) {
    if (event) event.stopPropagation();
    if (!currentUser) {
        window.location.hash = '#/auth';
        return;
    }

    const isLiked = userLikes.has(discussionId);
    const btn = document.querySelector(`.like-btn[data-id="${discussionId}"]`);
    let span;
    if (btn) {
        span = btn.querySelector('span');
        btn.classList.toggle('liked', !isLiked);
    }

    if (isLiked) {
        userLikes.delete(discussionId);
        if (span) span.innerText = Math.max(0, parseInt(span.innerText) - 1);
        await supabaseClient.from('likes').delete().match({ discussion_id: discussionId, user_id: currentUser.id });
    } else {
        userLikes.add(discussionId);
        if (span) span.innerText = parseInt(span.innerText) + 1;
        await supabaseClient.from('likes').insert([{ discussion_id: discussionId, user_id: currentUser.id }]);
    }
};

window.toggleSaveDiscussion = async function(discussionId, event) {
    if (event) event.stopPropagation();
    if (!currentUser) {
        window.location.hash = '#/auth';
        return;
    }

    const isSaved = userSaved.has(discussionId);
    const btn = document.querySelector(`.save-btn[data-id="${discussionId}"]`);
    let textSpan;
    if (btn) {
        textSpan = btn.querySelector('.save-text');
        btn.classList.toggle('saved', !isSaved);
    }

    if (isSaved) {
        userSaved.delete(discussionId);
        if (textSpan) textSpan.innerText = 'Salva nei Preferiti';
        await supabaseClient.from('saved_discussions').delete().match({ discussion_id: discussionId, user_id: currentUser.id });
    } else {
        userSaved.add(discussionId);
        if (textSpan) textSpan.innerText = 'Salvato';
        await supabaseClient.from('saved_discussions').insert([{ discussion_id: discussionId, user_id: currentUser.id }]);
    }
};

window.showReportModal = function(type, targetId) {
    if (!currentUser) {
        window.location.hash = '#/auth';
        return;
    }
    const template = document.getElementById('tmpl-report-modal').content.cloneNode(true);
    const container = document.getElementById('modal-container');
    container.innerHTML = '';
    container.appendChild(template);

    document.getElementById('cancel-report-btn').onclick = () => {
        container.innerHTML = '';
    };

    document.getElementById('report-form').onsubmit = async (e) => {
        e.preventDefault();
        const reason = document.getElementById('report-reason').value;
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        const payload = {
            reporter_id: currentUser.id,
            reason: reason,
            discussion_id: type === 'discussion' ? targetId : null,
            reply_id: type === 'reply' ? targetId : null
        };

        const { error } = await supabaseClient.from('reports').insert([payload]);
        if (error) {
            alert('Errore invio segnalazione: ' + error.message);
            submitBtn.disabled = false;
        } else {
            alert('Segnalazione inviata con successo. Grazie per il contributo.');
            container.innerHTML = '';
        }
    };
};

async function router() {
    const hash = window.location.hash || '#/';
    if (hash === '#/') {
        await renderHome();
    } else if (hash === '#/admin') {
        if (currentProfile && currentProfile.is_admin) await renderAdminDashboard();
        else window.location.hash = '#/';
    } else if (hash === '#/profilo') {
        if (currentUser) await renderProfile();
        else window.location.hash = '#/auth';
    } else if (hash.startsWith('#/discussion/')) {
        const id = hash.split('#/discussion/')[1];
        await renderDiscussion(id);
    } else if (hash === '#/auth') {
        renderAuth();
    } else {
        appEl.innerHTML = '<div class="text-center mt-4"><h3>Pagina non trovata</h3><a href="#/" class="btn-link">Torna alla home</a></div>';
    }
}

function updateNavbar() {
    const externalLink = `<a href="https://digitalefacile.regione.basilicata.it/fondamenti-di-intelligenza-artificiale/" target="_blank" class="nav-link">Vai al Sito</a>`;
    
    if (currentUser && currentProfile) {
        const adminBtn = currentProfile.is_admin ? `<a href="#/admin" class="nav-link">Dashboard Admin</a>` : '';
        const profileBtn = `<a href="#/profilo" class="nav-link">Il mio Profilo</a>`;
        navActionsEl.innerHTML = `
            ${externalLink}
            ${profileBtn}
            ${adminBtn}
            <span class="nav-user">Benvenuto, ${escapeHTML(currentProfile.username)}${currentProfile.is_admin ? ' <span class="badge badge-locked" style="margin-left:4px;">Admin</span>' : ''}</span>
            <button id="logout-btn" class="nav-link">Logout</button>
        `;
        document.getElementById('logout-btn').addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            window.location.hash = '#/';
        });
    } else {
        navActionsEl.innerHTML = `
            ${externalLink}
            <a href="#/auth" class="nav-link">Accedi / Registrati</a>
        `;
    }
}

async function initAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    await handleSession(session);

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        await handleSession(session);
        updateNavbar();
        if (event === 'SIGNED_IN') {
            await refreshUserData();
            if (window.location.hash === '#/auth') window.location.hash = '#/';
            else router();
        }
        if (event === 'SIGNED_OUT') {
            userLikes.clear();
            userSaved.clear();
            router();
        }
    });

    await refreshUserData();
    updateNavbar();
    router();
    window.addEventListener('hashchange', router);
}

async function handleSession(session) {
    if (session) {
        currentUser = session.user;
        const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
        if (!error && data) currentProfile = data;
    } else {
        currentUser = null;
        currentProfile = null;
    }
}

// ==============================
// VISTA HOME
// ==============================
async function renderHome() {
    const template = document.getElementById('tmpl-home').content.cloneNode(true);
    appEl.innerHTML = '';
    appEl.appendChild(template);

    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        if (tab.dataset.category === currentCategory) tab.classList.add('active');
        else tab.classList.remove('active');

        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = e.target.dataset.category;
            loadDiscussions(document.getElementById('search-input').value);
        });
    });

    const newBtnContainer = document.getElementById('new-discussion-btn-container');
    const newFormContainer = document.getElementById('new-discussion-form-container');
    
    if (currentUser) {
        newBtnContainer.innerHTML = `<button id="show-new-btn" class="btn btn-primary">Apri Nuova Discussione</button>`;
        document.getElementById('show-new-btn').addEventListener('click', () => {
            newFormContainer.style.display = 'block';
            newBtnContainer.style.display = 'none';
        });

        document.getElementById('cancel-discussion-btn').addEventListener('click', () => {
            newFormContainer.style.display = 'none';
            newBtnContainer.style.display = 'block';
        });

        document.getElementById('new-discussion-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('disc-title').value;
            const content = document.getElementById('disc-content').value;
            const category = document.getElementById('disc-category').value;
            
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            const { error } = await supabaseClient.from('discussions').insert([{ title, content, category, user_id: currentUser.id }]);
            if (error) {
                alert('Errore durante la creazione: ' + error.message);
                submitBtn.disabled = false;
            } else {
                newFormContainer.style.display = 'none';
                newBtnContainer.style.display = 'block';
                e.target.reset();
                submitBtn.disabled = false;
                loadDiscussions();
            }
        });
    }

    const searchInput = document.getElementById('search-input');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadDiscussions(e.target.value);
        }, 300);
    });

    await loadDiscussions();
}

async function loadDiscussions(searchQuery = '') {
    const listEl = document.getElementById('discussions-list');
    if (!listEl) return;

    let query = supabaseClient.from('discussions')
        .select(`id, title, content, category, likes_count, created_at, is_locked, profiles (username)`)
        .order('likes_count', { ascending: false })
        .order('created_at', { ascending: false });

    if (currentCategory !== 'Tutte') query = query.eq('category', currentCategory);
    if (searchQuery) query = query.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`);

    const { data, error } = await query;
    if (error) {
        listEl.innerHTML = `<div class="error-msg">Errore caricamento discussioni.</div>`;
        return;
    }

    if (data.length === 0) {
        listEl.innerHTML = `<div class="text-center text-muted card mt-4">Nessuna discussione trovata.</div>`;
        return;
    }

    listEl.innerHTML = '';
    data.forEach(disc => {
        const div = document.createElement('div');
        div.className = 'discussion-card';
        div.onclick = () => window.location.hash = `#/discussion/${disc.id}`;
        
        const lockedBadge = disc.is_locked ? `<span class="badge badge-locked">Chiusa</span>` : '';
        const excerpt = escapeHTML(disc.content).substring(0, 150) + (disc.content.length > 150 ? '...' : '');
        const username = disc.profiles ? escapeHTML(disc.profiles.username) : 'Sconosciuto';

        const isLiked = userLikes.has(disc.id);
        const likeClass = isLiked ? 'like-btn liked' : 'like-btn';

        div.innerHTML = `
            <div class="discussion-card-title">
                <span><span class="badge badge-category">${escapeHTML(disc.category)}</span> ${escapeHTML(disc.title)}</span>
                ${lockedBadge}
            </div>
            <div class="discussion-card-excerpt">${excerpt}</div>
            <div class="card-actions">
                <div class="discussion-card-meta" style="border:none; padding:0;">
                    <span>Autore: <strong>${username}</strong> &bull; ${formatDate(disc.created_at)}</span>
                </div>
                <button class="${likeClass}" data-id="${disc.id}" onclick="toggleLike('${disc.id}', event)">
                    ${getHeartSvg()} <span>${disc.likes_count || 0}</span>
                </button>
            </div>
        `;
        listEl.appendChild(div);
    });
}

// ==============================
// VISTA DETTAGLIO
// ==============================
async function renderDiscussion(id) {
    const template = document.getElementById('tmpl-discussion').content.cloneNode(true);
    appEl.innerHTML = '';
    appEl.appendChild(template);

    const container = document.getElementById('discussion-detail-container');
    const formContainer = document.getElementById('reply-form-container');

    const { data: disc, error } = await supabaseClient.from('discussions')
        .select(`*, profiles (username)`).eq('id', id).single();

    if (error || !disc) {
        container.innerHTML = `<div class="error-msg">Errore o discussione non trovata.</div>`;
        return;
    }

    const isAdmin = currentProfile?.is_admin;
    const username = disc.profiles ? escapeHTML(disc.profiles.username) : 'Sconosciuto';
    const isLiked = userLikes.has(disc.id);
    const likeClass = isLiked ? 'like-btn liked' : 'like-btn';

    const isSaved = userSaved.has(disc.id);
    const saveClass = isSaved ? 'save-btn saved' : 'save-btn';
    const saveText = isSaved ? 'Salvato' : 'Salva nei Preferiti';

    let adminActionsHtml = '';
    if (isAdmin) {
        adminActionsHtml = `
            <div class="admin-actions">
                <button id="admin-lock-btn" class="btn btn-secondary btn-sm">${disc.is_locked ? 'Sblocca Discussione' : 'Blocca Discussione'}</button>
                <button id="admin-del-disc-btn" class="btn btn-danger btn-sm">Elimina (Admin)</button>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="discussion-detail-header">
            <h2 class="discussion-detail-title">
                <span>${escapeHTML(disc.title)}</span>
                ${disc.is_locked ? '<span class="badge badge-locked" style="font-size:0.5em; vertical-align:middle; margin-left:10px;">Chiusa</span>' : ''}
            </h2>
            <div class="discussion-detail-meta">
                <span class="badge badge-category">${escapeHTML(disc.category)}</span> Aperta da <strong>${username}</strong> il ${formatDate(disc.created_at)}
            </div>
        </div>
        <div class="discussion-detail-content">${escapeHTML(disc.content)}</div>
        
        <div class="card-actions mt-4">
            <div>
                <button class="${likeClass}" data-id="${disc.id}" onclick="toggleLike('${disc.id}')">
                    ${getHeartSvg()} <span>${disc.likes_count || 0}</span>
                </button>
            </div>
            <div>
                <button class="${saveClass}" data-id="${disc.id}" onclick="toggleSaveDiscussion('${disc.id}')">
                    ${getBookmarkSvg()} <span class="save-text">${saveText}</span>
                </button>
                <button class="btn-report" onclick="showReportModal('discussion', '${disc.id}')">Segnala</button>
            </div>
        </div>
        ${adminActionsHtml}
    `;

    if (isAdmin) {
        document.getElementById('admin-lock-btn').addEventListener('click', async () => {
            const { error: lockErr } = await supabaseClient.from('discussions').update({ is_locked: !disc.is_locked }).eq('id', disc.id);
            if (!lockErr) renderDiscussion(id);
        });
        document.getElementById('admin-del-disc-btn').addEventListener('click', async () => {
            if (confirm('Sei sicuro di voler eliminare questa discussione?')) {
                const { error: delErr } = await supabaseClient.from('discussions').delete().eq('id', disc.id);
                if (!delErr) window.location.hash = '#/';
            }
        });
    }

    await loadReplies(id, isAdmin, disc.is_locked);

    if (!currentUser) document.getElementById('reply-login-msg').style.display = 'block';
    else if (disc.is_locked) document.getElementById('reply-locked-msg').style.display = 'block';
    else {
        formContainer.style.display = 'block';
        document.getElementById('reply-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = document.getElementById('reply-content').value;
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            const { error: replyErr } = await supabaseClient.from('replies').insert([{ discussion_id: id, content, user_id: currentUser.id }]);
            if (replyErr) {
                alert('Errore invio risposta: ' + replyErr.message);
                submitBtn.disabled = false;
            } else {
                document.getElementById('reply-content').value = '';
                submitBtn.disabled = false;
                await loadReplies(id, isAdmin, disc.is_locked);
            }
        });
    }
}

async function loadReplies(discussionId, isAdmin, isLocked) {
    const listEl = document.getElementById('replies-list');
    const { data: replies, error } = await supabaseClient.from('replies').select(`id, content, created_at, profiles (username)`).eq('discussion_id', discussionId).order('created_at', { ascending: true });
    
    if (error) { listEl.innerHTML = `<div class="error-msg">Errore caricamento risposte.</div>`; return; }
    if (replies.length === 0) { listEl.innerHTML = `<div class="text-muted mt-2">Nessuna risposta al momento.</div>`; return; }

    listEl.innerHTML = '';
    replies.forEach(r => {
        const div = document.createElement('div');
        div.className = 'reply-card';
        const username = r.profiles ? escapeHTML(r.profiles.username) : 'Sconosciuto';
        let adminBtn = isAdmin ? `<button class="btn btn-danger btn-sm" onclick="deleteReply('${r.id}', '${discussionId}')">Elimina (Admin)</button>` : '';

        div.innerHTML = `
            <div class="reply-header">
                <span><strong>${username}</strong> &bull; ${formatDate(r.created_at)}</span>
                <div>
                    <button class="btn-report" style="margin-right:10px;" onclick="showReportModal('reply', '${r.id}')">Segnala</button>
                    ${adminBtn}
                </div>
            </div>
            <div class="reply-content">${escapeHTML(r.content)}</div>
        `;
        listEl.appendChild(div);
    });
}

window.deleteReply = async function(replyId, discussionId) {
    if (confirm('Vuoi eliminare questa risposta?')) {
        await supabaseClient.from('replies').delete().eq('id', replyId);
        loadReplies(discussionId, currentProfile?.is_admin);
    }
};

// ==============================
// VISTA PROFILO UTENTE
// ==============================
async function renderProfile() {
    const template = document.getElementById('tmpl-profile').content.cloneNode(true);
    appEl.innerHTML = '';
    appEl.appendChild(template);

    let profileTab = 'mie-discussioni';
    
    const tabs = document.querySelectorAll('.profile-tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            profileTab = e.target.dataset.tab;
            loadProfileContent(profileTab);
        });
    });

    await loadProfileContent(profileTab);
}

async function loadProfileContent(tab) {
    const listEl = document.getElementById('profile-content-list');
    listEl.innerHTML = '<div class="text-center text-muted">Caricamento in corso...</div>';

    let discussions = [];

    if (tab === 'mie-discussioni') {
        const { data, error } = await supabaseClient.from('discussions')
            .select(`id, title, content, category, likes_count, created_at, is_locked, profiles (username)`)
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
        if (error) { listEl.innerHTML = '<div class="error-msg">Errore</div>'; return; }
        discussions = data;
    } else {
        // I miei preferiti
        const { data, error } = await supabaseClient.from('saved_discussions')
            .select(`
                discussion_id,
                discussions (id, title, content, category, likes_count, created_at, is_locked, profiles (username))
            `)
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
        if (error) { listEl.innerHTML = '<div class="error-msg">Errore</div>'; return; }
        discussions = data.map(item => item.discussions).filter(d => d !== null); // estrae le info
    }

    if (discussions.length === 0) {
        listEl.innerHTML = `<div class="text-center text-muted card mt-4">Nessun contenuto trovato in questa sezione.</div>`;
        return;
    }

    listEl.innerHTML = '';
    discussions.forEach(disc => {
        const div = document.createElement('div');
        div.className = 'discussion-card';
        div.onclick = () => window.location.hash = `#/discussion/${disc.id}`;
        
        const lockedBadge = disc.is_locked ? `<span class="badge badge-locked">Chiusa</span>` : '';
        const excerpt = escapeHTML(disc.content).substring(0, 150) + (disc.content.length > 150 ? '...' : '');
        const username = disc.profiles ? escapeHTML(disc.profiles.username) : 'Sconosciuto';

        div.innerHTML = `
            <div class="discussion-card-title">
                <span><span class="badge badge-category">${escapeHTML(disc.category)}</span> ${escapeHTML(disc.title)}</span>
                ${lockedBadge}
            </div>
            <div class="discussion-card-excerpt">${excerpt}</div>
            <div class="card-actions">
                <div class="discussion-card-meta" style="border:none; padding:0;">
                    <span>Autore: <strong>${username}</strong> &bull; ${formatDate(disc.created_at)}</span>
                </div>
            </div>
        `;
        listEl.appendChild(div);
    });
}

// ==============================
// VISTA ADMIN
// ==============================
async function renderAdminDashboard() {
    const template = document.getElementById('tmpl-admin').content.cloneNode(true);
    appEl.innerHTML = '';
    appEl.appendChild(template);

    const [usersCount, discCount, repliesCount] = await Promise.all([
        supabaseClient.from('profiles').select('id', { count: 'exact', head: true }),
        supabaseClient.from('discussions').select('id', { count: 'exact', head: true }),
        supabaseClient.from('replies').select('id', { count: 'exact', head: true })
    ]);

    document.getElementById('stat-users').innerText = usersCount.count || 0;
    document.getElementById('stat-discussions').innerText = discCount.count || 0;
    document.getElementById('stat-replies').innerText = repliesCount.count || 0;

    const tbody = document.getElementById('admin-users-tbody');
    const { data: users, error: usersErr } = await supabaseClient.from('profiles').select('*').order('username', { ascending: true });
    if (!usersErr) {
        tbody.innerHTML = '';
        users.forEach(u => {
            const tr = document.createElement('tr');
            const role = u.is_admin ? '<span class="badge badge-locked" style="background-color:#003366;color:#fff;">Admin</span>' : 'Utente';
            const actionBtn = u.is_admin 
                ? `<button class="btn btn-secondary btn-sm" onclick="toggleUserRole('${u.id}', true)">Rendi Utente</button>`
                : `<button class="btn btn-primary btn-sm" onclick="toggleUserRole('${u.id}', false)">Promuovi ad Admin</button>`;
            const actionHtml = (u.id === currentUser.id) ? '<span class="text-muted">Tu</span>' : actionBtn;
            tr.innerHTML = `<td><strong>${escapeHTML(u.username)}</strong></td><td>${role}</td><td style="text-align: right;">${actionHtml}</td>`;
            tbody.appendChild(tr);
        });
    }

    const reportsTbody = document.getElementById('admin-reports-tbody');
    const { data: reports, error: reportsErr } = await supabaseClient
        .from('reports').select(`*, profiles(username), discussions(title), replies(content)`).eq('is_archived', false).order('created_at', { ascending: false });

    if (!reportsErr) {
        if (reports.length === 0) reportsTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nessuna segnalazione attiva.</td></tr>';
        else {
            reportsTbody.innerHTML = '';
            reports.forEach(rep => {
                const tr = document.createElement('tr');
                const reporter = rep.profiles ? escapeHTML(rep.profiles.username) : 'Anonimo';
                let typeHtml = '', targetId = '', contentType = '';
                if (rep.discussion_id) {
                    typeHtml = `<span class="badge" style="background-color:#e0f2fe; color:#0369a1;">Discussione</span><br><small>${escapeHTML(rep.discussions?.title).substring(0,30)}...</small>`;
                    targetId = rep.discussion_id; contentType = 'discussion';
                } else if (rep.reply_id) {
                    typeHtml = `<span class="badge" style="background-color:#f1f5f9; color:#475569;">Risposta</span><br><small>${escapeHTML(rep.replies?.content).substring(0,30)}...</small>`;
                    targetId = rep.reply_id; contentType = 'reply';
                }
                tr.innerHTML = `<td>${formatDate(rep.created_at)}</td><td><strong>${reporter}</strong></td><td>${typeHtml}</td><td>${escapeHTML(rep.reason)}</td>
                    <td style="text-align: right; white-space: nowrap;"><button class="btn btn-secondary btn-sm" onclick="archiveReport('${rep.id}')">Archivia</button> <button class="btn btn-danger btn-sm" onclick="deleteReportedContent('${contentType}', '${targetId}', '${rep.id}')">Elimina</button></td>`;
                reportsTbody.appendChild(tr);
            });
        }
    }
}

window.toggleUserRole = async function(userId, currentIsAdmin) {
    if (confirm('Cambiare il ruolo di questo utente?')) {
        const { error } = await supabaseClient.from('profiles').update({ is_admin: !currentIsAdmin }).eq('id', userId);
        if (!error) renderAdminDashboard();
    }
};

window.archiveReport = async function(reportId) {
    await supabaseClient.from('reports').update({ is_archived: true }).eq('id', reportId);
    renderAdminDashboard();
};

window.deleteReportedContent = async function(type, targetId, reportId) {
    if (confirm('Eliminare il contenuto dal database?')) {
        if (type === 'discussion') await supabaseClient.from('discussions').delete().eq('id', targetId);
        else if (type === 'reply') await supabaseClient.from('replies').delete().eq('id', targetId);
        await archiveReport(reportId); 
    }
};

// ==============================
// VISTA AUTENTICAZIONE
// ==============================
function renderAuth() {
    const template = document.getElementById('tmpl-auth').content.cloneNode(true);
    appEl.innerHTML = '';
    appEl.appendChild(template);
    let isLogin = true;
    const authTitle = document.getElementById('auth-title');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const usernameGroup = document.getElementById('username-group');
    const switchText = document.getElementById('auth-switch-text');
    const switchBtn = document.getElementById('auth-switch-btn');
    const form = document.getElementById('auth-form');
    const errorMsg = document.getElementById('auth-error');

    switchBtn.addEventListener('click', () => {
        isLogin = !isLogin;
        errorMsg.innerText = '';
        if (isLogin) {
            authTitle.innerText = 'Accedi'; authSubmitBtn.innerText = 'Accedi';
            usernameGroup.style.display = 'none'; document.getElementById('username').removeAttribute('required');
            switchText.innerText = 'Non hai un account?'; switchBtn.innerText = 'Registrati';
        } else {
            authTitle.innerText = 'Registrati'; authSubmitBtn.innerText = 'Registrati';
            usernameGroup.style.display = 'block'; document.getElementById('username').setAttribute('required', 'true');
            switchText.innerText = 'Hai già un account?'; switchBtn.innerText = 'Accedi';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMsg.innerText = '';
        const email = document.getElementById('email').value, password = document.getElementById('password').value, username = document.getElementById('username').value;
        authSubmitBtn.disabled = true;
        if (isLogin) {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) { errorMsg.innerText = "Credenziali non valide."; authSubmitBtn.disabled = false; }
        } else {
            const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: { username } } });
            if (error) { errorMsg.innerText = error.message; authSubmitBtn.disabled = false; }
            else {
                const { error: loginErr } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (loginErr) { errorMsg.innerText = 'Registrazione completata, ma impossibile accedere.'; switchBtn.click(); authSubmitBtn.disabled = false; }
            }
        }
    });
}

initAuth();
