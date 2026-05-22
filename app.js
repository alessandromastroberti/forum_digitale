const SUPABASE_URL = 'https://pfrdajeqzlendojpwazl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ProqLjfVvB2XD5kCZN5pjQ_nlm0lsvg';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;

// Utility elements
const appEl = document.getElementById('app');
const navActionsEl = document.getElementById('nav-actions');

// Utility to format dates
function formatDate(dateString) {
    const d = new Date(dateString);
    return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});
}

// Escaping HTML per sicurezza
function escapeHTML(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}

// Router
async function router() {
    const hash = window.location.hash || '#/';
    
    if (hash === '#/') {
        await renderHome();
    } else if (hash === '#/admin') {
        if (currentProfile && currentProfile.is_admin) {
            await renderAdminDashboard();
        } else {
            window.location.hash = '#/';
        }
    } else if (hash.startsWith('#/discussion/')) {
        const id = hash.split('#/discussion/')[1];
        await renderDiscussion(id);
    } else if (hash === '#/auth') {
        renderAuth();
    } else {
        appEl.innerHTML = '<div class="text-center mt-4"><h3>Pagina non trovata</h3><a href="#/" class="btn-link">Torna alla home</a></div>';
    }
}

// Aggiornamento Navbar
function updateNavbar() {
    if (currentUser && currentProfile) {
        const adminBtn = currentProfile.is_admin ? `<a href="#/admin" class="btn btn-secondary btn-sm" style="margin-right:10px;">Dashboard Admin</a>` : '';
        navActionsEl.innerHTML = `
            ${adminBtn}
            <span class="nav-user">Benvenuto, ${escapeHTML(currentProfile.username)}${currentProfile.is_admin ? ' <span class="badge badge-locked" style="background-color:#003366;color:#fff;">Admin</span>' : ''}</span>
            <button id="logout-btn" class="btn btn-secondary btn-sm" style="margin-left:10px;">Logout</button>
        `;
        document.getElementById('logout-btn').addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            window.location.hash = '#/';
        });
    } else {
        navActionsEl.innerHTML = `
            <a href="#/auth" class="btn btn-secondary btn-sm">Accedi / Registrati</a>
        `;
    }
}

// Inizializzazione Autenticazione
async function initAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    await handleSession(session);

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        await handleSession(session);
        updateNavbar();
        if (event === 'SIGNED_IN' && window.location.hash === '#/auth') {
            window.location.hash = '#/';
        }
        if (event === 'SIGNED_OUT') {
            router();
        }
    });

    // Caricamento iniziale
    updateNavbar();
    router();
    window.addEventListener('hashchange', router);
}

async function handleSession(session) {
    if (session) {
        currentUser = session.user;
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        if (!error && data) {
            currentProfile = data;
        }
    } else {
        currentUser = null;
        currentProfile = null;
    }
}

// ==============================
// VISTA HOME (Elenco Discussioni)
// ==============================
async function renderHome() {
    const template = document.getElementById('tmpl-home').content.cloneNode(true);
    appEl.innerHTML = '';
    appEl.appendChild(template);

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
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            const { error } = await supabaseClient
                .from('discussions')
                .insert([{ title, content, user_id: currentUser.id }]);

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
    // Debounce semplice per la ricerca
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

    let query = supabaseClient
        .from('discussions')
        .select(`
            id, title, content, created_at, is_locked,
            profiles (username)
        `)
        .order('created_at', { ascending: false });

    if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;

    if (error) {
        listEl.innerHTML = `<div class="error-msg">Errore caricamento discussioni: ${error.message}</div>`;
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
        const username = disc.profiles ? escapeHTML(disc.profiles.username) : 'Utente Sconosciuto';

        div.innerHTML = `
            <div class="discussion-card-title">
                <span>${escapeHTML(disc.title)}</span>
                ${lockedBadge}
            </div>
            <div class="discussion-card-excerpt">${excerpt}</div>
            <div class="discussion-card-meta">
                <span>Autore: <strong>${username}</strong></span>
                <span>${formatDate(disc.created_at)}</span>
            </div>
        `;
        listEl.appendChild(div);
    });
}

// ==============================
// VISTA DETTAGLIO DISCUSSIONE
// ==============================
async function renderDiscussion(id) {
    const template = document.getElementById('tmpl-discussion').content.cloneNode(true);
    appEl.innerHTML = '';
    appEl.appendChild(template);

    const container = document.getElementById('discussion-detail-container');
    const formContainer = document.getElementById('reply-form-container');

    // Recupera la discussione
    const { data: disc, error } = await supabaseClient
        .from('discussions')
        .select(`
            *,
            profiles (username)
        `)
        .eq('id', id)
        .single();

    if (error || !disc) {
        container.innerHTML = `<div class="error-msg">Errore o discussione non trovata.</div>`;
        return;
    }

    const isAdmin = currentProfile?.is_admin;
    const username = disc.profiles ? escapeHTML(disc.profiles.username) : 'Utente Sconosciuto';

    let adminActionsHtml = '';
    if (isAdmin) {
        adminActionsHtml = `
            <div class="admin-actions">
                <button id="admin-lock-btn" class="btn btn-secondary btn-sm">${disc.is_locked ? 'Sblocca Discussione' : 'Blocca Discussione'}</button>
                <button id="admin-del-disc-btn" class="btn btn-danger btn-sm">Elimina Discussione</button>
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
                Aperta da <strong>${username}</strong> il ${formatDate(disc.created_at)}
            </div>
        </div>
        <div class="discussion-detail-content">${escapeHTML(disc.content)}</div>
        ${adminActionsHtml}
    `;

    if (isAdmin) {
        document.getElementById('admin-lock-btn').addEventListener('click', async () => {
            const { error: lockErr } = await supabaseClient
                .from('discussions')
                .update({ is_locked: !disc.is_locked })
                .eq('id', disc.id);
            if (!lockErr) renderDiscussion(id);
        });

        document.getElementById('admin-del-disc-btn').addEventListener('click', async () => {
            if (confirm('Sei sicuro di voler eliminare questa discussione?')) {
                const { error: delErr } = await supabaseClient
                    .from('discussions')
                    .delete()
                    .eq('id', disc.id);
                if (!delErr) window.location.hash = '#/';
            }
        });
    }

    // Carica le risposte
    await loadReplies(id, isAdmin);

    // Gestione Form di Risposta
    if (!currentUser) {
        document.getElementById('reply-login-msg').style.display = 'block';
    } else if (disc.is_locked) {
        document.getElementById('reply-locked-msg').style.display = 'block';
    } else {
        formContainer.style.display = 'block';
        document.getElementById('reply-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = document.getElementById('reply-content').value;
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            const { error: replyErr } = await supabaseClient
                .from('replies')
                .insert([{ discussion_id: id, content, user_id: currentUser.id }]);

            if (replyErr) {
                alert('Errore invio risposta: ' + replyErr.message);
                submitBtn.disabled = false;
            } else {
                document.getElementById('reply-content').value = '';
                submitBtn.disabled = false;
                await loadReplies(id, isAdmin);
            }
        });
    }
}

async function loadReplies(discussionId, isAdmin) {
    const listEl = document.getElementById('replies-list');
    const { data: replies, error } = await supabaseClient
        .from('replies')
        .select(`
            id, content, created_at,
            profiles (username)
        `)
        .eq('discussion_id', discussionId)
        .order('created_at', { ascending: true });

    if (error) {
        listEl.innerHTML = `<div class="error-msg">Errore caricamento risposte.</div>`;
        return;
    }

    if (replies.length === 0) {
        listEl.innerHTML = `<div class="text-muted mt-2">Nessuna risposta al momento.</div>`;
        return;
    }

    listEl.innerHTML = '';
    replies.forEach(r => {
        const div = document.createElement('div');
        div.className = 'reply-card';
        const username = r.profiles ? escapeHTML(r.profiles.username) : 'Utente Sconosciuto';

        let adminBtn = '';
        if (isAdmin) {
            adminBtn = `<button class="btn btn-danger btn-sm" onclick="deleteReply('${r.id}', '${discussionId}')">Elimina Risposta</button>`;
        }

        div.innerHTML = `
            <div class="reply-header">
                <strong>${username}</strong>
                <span>${formatDate(r.created_at)}</span>
            </div>
            <div class="reply-content">${escapeHTML(r.content)}</div>
            ${adminBtn ? `<div class="mt-2 text-right" style="text-align:right;">${adminBtn}</div>` : ''}
        `;
        listEl.appendChild(div);
    });
}

// Funzione globale per eliminare la risposta da onClick HTML
window.deleteReply = async function(replyId, discussionId) {
    if (confirm('Vuoi eliminare questa risposta?')) {
        await supabaseClient.from('replies').delete().eq('id', replyId);
        loadReplies(discussionId, currentProfile?.is_admin);
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
            authTitle.innerText = 'Accedi';
            authSubmitBtn.innerText = 'Accedi';
            usernameGroup.style.display = 'none';
            document.getElementById('username').removeAttribute('required');
            switchText.innerText = 'Non hai un account?';
            switchBtn.innerText = 'Registrati';
        } else {
            authTitle.innerText = 'Registrati';
            authSubmitBtn.innerText = 'Registrati';
            usernameGroup.style.display = 'block';
            document.getElementById('username').setAttribute('required', 'true');
            switchText.innerText = 'Hai già un account?';
            switchBtn.innerText = 'Accedi';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMsg.innerText = '';
        errorMsg.style.color = 'var(--danger-color)';
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const username = document.getElementById('username').value;
        authSubmitBtn.disabled = true;

        if (isLogin) {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) {
                errorMsg.innerText = "Credenziali non valide.";
                authSubmitBtn.disabled = false;
            }
        } else {
            const { error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: { username }
                }
            });
            if (error) {
                errorMsg.innerText = error.message;
                authSubmitBtn.disabled = false;
            } else {
                // Auto-login after successful registration
                const { error: loginErr } = await supabaseClient.auth.signInWithPassword({ email, password });
                
                if (loginErr) {
                    errorMsg.style.color = 'var(--danger-color)';
                    errorMsg.innerText = 'Registrazione completata, ma impossibile accedere automaticamente. Riprova.';
                    switchBtn.click();
                    authSubmitBtn.disabled = false;
                } else {
                    errorMsg.style.color = '#28a745';
                    errorMsg.innerText = 'Accesso effettuato con successo!';
                    // onAuthStateChange gestirà il redirect alla home
                }
            }
        }
    });
}

// ==============================
// VISTA ADMIN DASHBOARD
// ==============================
async function renderAdminDashboard() {
    const template = document.getElementById('tmpl-admin').content.cloneNode(true);
    appEl.innerHTML = '';
    appEl.appendChild(template);

    // Carica conteggi
    const [usersCount, discCount, repliesCount] = await Promise.all([
        supabaseClient.from('profiles').select('id', { count: 'exact', head: true }),
        supabaseClient.from('discussions').select('id', { count: 'exact', head: true }),
        supabaseClient.from('replies').select('id', { count: 'exact', head: true })
    ]);

    document.getElementById('stat-users').innerText = usersCount.count || 0;
    document.getElementById('stat-discussions').innerText = discCount.count || 0;
    document.getElementById('stat-replies').innerText = repliesCount.count || 0;

    // Carica utenti
    const tbody = document.getElementById('admin-users-tbody');
    const { data: users, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .order('username', { ascending: true });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="3" class="error-msg">Errore caricamento utenti</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        const role = u.is_admin ? '<span class="badge badge-locked" style="background-color:#003366;color:#fff;">Admin</span>' : 'Utente';
        const actionBtn = u.is_admin 
            ? `<button class="btn btn-secondary btn-sm" onclick="toggleUserRole('${u.id}', true)">Rendi Utente</button>`
            : `<button class="btn btn-primary btn-sm" onclick="toggleUserRole('${u.id}', false)">Promuovi ad Admin</button>`;

        // Non permettere all'admin di de-promuovere se stesso per evitare blocchi
        const actionHtml = (u.id === currentUser.id) ? '<span class="text-muted">Tu</span>' : actionBtn;

        tr.innerHTML = `
            <td><strong>${escapeHTML(u.username)}</strong></td>
            <td>${role}</td>
            <td style="text-align: right;">${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

window.toggleUserRole = async function(userId, currentIsAdmin) {
    if (confirm('Vuoi davvero cambiare il ruolo di questo utente?')) {
        const { error } = await supabaseClient
            .from('profiles')
            .update({ is_admin: !currentIsAdmin })
            .eq('id', userId);
            
        if (error) {
            alert('Errore: ' + error.message);
        } else {
            renderAdminDashboard();
        }
    }
};

// Avvio dell'applicazione
initAuth();
