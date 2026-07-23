// ========== متغیرها ==========
let currentUser = null;
let messagesCache = [];
let pinnedMsg = null;
let pollingInterval = null;
let typingInterval = null;
let currentTypingTimeout = null;
let searchQuery = '';
let replyToMsg = null;
let userScrolledUp = false;
let lastNotifiedMessageId = null;
let polls = [];
let gamePolling = null;
let currentPrivateChat = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const isTaha = window.isTaha || false;

// ========== امنیت برای کاربران عادی ==========
if (!isTaha) {
    document.addEventListener('copy', (e) => e.preventDefault());
    document.addEventListener('cut', (e) => e.preventDefault());
    document.addEventListener('paste', (e) => e.preventDefault());
    document.addEventListener('dragstart', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'v')) {
            e.preventDefault();
            return false;
        }
        if (e.key === 'PrintScreen') {
            alert('اسکرین‌شات ممنوع است!');
            e.preventDefault();
            return false;
        }
    });
}

// ========== توابع API ==========
async function apiCall(action, formData = null) {
    let url = `taha.php?action=${action}`;
    let options = { method: formData ? 'POST' : 'GET' };
    if (formData) options.body = formData;
    const res = await fetch(url, options);
    return await res.json();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

function saveDraft() {
    const draft = document.getElementById('message-text')?.value;
    if (draft !== undefined && currentUser) localStorage.setItem('chat_draft_' + currentUser, draft);
}
function loadDraft() {
    if (!currentUser) return;
    const draft = localStorage.getItem('chat_draft_' + currentUser);
    const input = document.getElementById('message-text');
    if (draft && input) {
        input.value = draft;
        input.focus();
        input.setSelectionRange(draft.length, draft.length);
    }
}
function clearDraft() {
    if (currentUser) localStorage.removeItem('chat_draft_' + currentUser);
}

function updateTitle(onlineCount) {
    document.title = onlineCount > 0 ? `چت سبز (${onlineCount} آنلاین)` : 'چت سبز';
}

function copyMessage(text) {
    if (!isTaha) return;
    navigator.clipboard.writeText(text).then(() => {
        const toast = document.createElement('div');
        toast.innerText = '✅ متن کپی شد';
        toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#2e7d5e; color:white; padding:8px 16px; border-radius:40px; z-index:9999;';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1500);
    });
}

function getDateCategory(timestamp) {
    const now = new Date();
    const msgDate = new Date(timestamp * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const msgDateOnly = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());
    if (msgDateOnly.getTime() === today.getTime()) return 'امروز';
    if (msgDateOnly.getTime() === yesterday.getTime()) return 'دیروز';
    const diffDays = Math.floor((today - msgDateOnly) / (1000*60*60*24));
    if (diffDays < 7) return 'این هفته';
    if (diffDays < 30) return 'این ماه';
    return 'قدیمی‌تر';
}

function uploadFileWithProgress(file, replyId) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const fd = new FormData();
        fd.append('text', '');
        fd.append('file', file);
        if (replyId) fd.append('reply_to', replyId);
        if (currentPrivateChat) fd.append('to', currentPrivateChat);
        xhr.open('POST', 'taha.php?action=send');
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                document.getElementById('progress-fill').style.width = percent + '%';
                document.getElementById('progress-percent').innerText = Math.round(percent) + '%';
                document.getElementById('upload-progress').classList.remove('hidden');
            }
        };
        xhr.onload = () => {
            document.getElementById('upload-progress').classList.add('hidden');
            if (xhr.status === 200) {
                const res = JSON.parse(xhr.responseText);
                if (res.ok) resolve();
                else reject(res.error);
            } else reject('خطا در آپلود');
        };
        xhr.onerror = () => reject('خطا در شبکه');
        xhr.send(fd);
    });
}

// ========== ذخیره اسکرول ==========
function saveScrollPosition() {
    const container = document.getElementById('messages-area');
    if (container && currentUser) localStorage.setItem('chat_scroll_' + currentUser, container.scrollTop);
}
function restoreScrollPosition() {
    const container = document.getElementById('messages-area');
    if (container && currentUser) {
        const saved = localStorage.getItem('chat_scroll_' + currentUser);
        if (saved !== null) {
            container.scrollTop = parseInt(saved);
            localStorage.removeItem('chat_scroll_' + currentUser);
        }
    }
}
window.addEventListener('beforeunload', () => {
    if (gamePolling) clearInterval(gamePolling);
    if (currentUser) saveScrollPosition();
});

// ========== رندر پیام‌ها ==========
function attachMessageEvents() {
    document.querySelectorAll('.reply-action').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const username = btn.dataset.username;
            let text = btn.dataset.text;
            text = text.length > 50 ? text.substring(0,50)+'...' : text;
            const thumb = btn.dataset.thumb || '';
            replyToMsg = { id, username, text, thumb };
            document.getElementById('reply-preview-text').innerText = `${replyToMsg.username}: ${replyToMsg.text}`;
            const thumbDiv = document.getElementById('reply-thumb');
            const thumbImg = document.getElementById('reply-thumb-img');
            if (thumb && thumbImg) { thumbImg.src = thumb; thumbDiv.style.display = 'block'; }
            else if (thumbDiv) thumbDiv.style.display = 'none';
            document.getElementById('reply-indicator').style.display = 'flex';
            document.getElementById('message-text').focus();
        };
    });
    document.querySelectorAll('.pin-action').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const fd = new FormData(); fd.append('id', btn.dataset.id);
            const res = await apiCall('pin', fd);
            if (res.ok) loadMessages(); else alert(res.error);
        };
    });
    document.querySelectorAll('.edit-msg').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const newText = prompt('متن جدید را وارد کنید:');
            if (newText) {
                const fd = new FormData(); fd.append('id', btn.dataset.id); fd.append('text', newText);
                const res = await apiCall('edit', fd);
                if (res.ok) loadMessages(); else alert(res.error);
            }
        };
    });
    document.querySelectorAll('.delete-msg').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm('آیا این پیام حذف شود؟')) {
                const fd = new FormData(); fd.append('id', btn.dataset.id);
                const res = await apiCall('delete', fd);
                if (res.ok) loadMessages(); else alert(res.error);
            }
        };
    });
    document.querySelectorAll('.reaction-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const fd = new FormData(); fd.append('id', btn.dataset.id); fd.append('emoji', btn.dataset.emoji);
            await apiCall('react', fd);
            loadMessages();
        };
    });
    if (isTaha) {
        document.querySelectorAll('.copy-msg').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                copyMessage(btn.dataset.text);
            };
        });
    }
}

function renderMessages() {
    const container = document.getElementById('messages-area');
    if (!container) return;
    let filtered = messagesCache;
    if (searchQuery.trim()) {
        const low = searchQuery.toLowerCase();
        filtered = filtered.filter(m => (m.text && m.text.toLowerCase().includes(low)) || (m.username && m.username.toLowerCase().includes(low)));
    }
    if (currentPrivateChat) {
        filtered = filtered.filter(m => {
            if (!m.to) return false;
            return (m.owner === currentPrivateChat && m.to === currentUser) || (m.owner === currentUser && m.to === currentPrivateChat);
        });
    } else {
        filtered = filtered.filter(m => !m.to);
    }
    if (filtered.length === 0) {
        container.innerHTML = '<div class="loading-msg">پیامی یافت نشد</div>';
        return;
    }
    const grouped = {};
    filtered.forEach(msg => {
        const cat = getDateCategory(msg.timestamp);
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(msg);
    });
    const oldHeight = container.scrollHeight;
    const oldTop = container.scrollTop;
    const wasAtBottom = (oldTop + container.clientHeight) >= (oldHeight - 50);
    container.innerHTML = '';
    for (const [cat, msgs] of Object.entries(grouped)) {
        const header = document.createElement('div'); header.className = 'date-header'; header.innerText = cat;
        container.appendChild(header);
        msgs.forEach(msg => {
            const isOwn = (msg.owner === currentUser);
            const isDelAdmin = (msg.deleted_display === true);
            const bubble = document.createElement('div');
            bubble.className = `message-bubble ${isOwn ? 'own' : ''}`;
            if (isDelAdmin) bubble.classList.add('message-deleted-admin');
            bubble.dataset.id = msg.id;
            let actionsHtml = '';
            if (!msg.deleted || isDelAdmin) {
                if (isOwn) {
                    actionsHtml = `<div class="message-actions">
                        <button class="reply-action" data-id="${msg.id}" data-username="${escapeHtml(msg.username)}" data-text="${escapeHtml(msg.text)}" data-thumb="${msg.file_url && msg.file_type?.startsWith('image/') ? msg.file_url : ''}">↩️ پاسخ</button>
                        <button class="pin-action" data-id="${msg.id}">📌 پین</button>
                        <button class="edit-msg" data-id="${msg.id}">✏️</button>
                        <button class="delete-msg" data-id="${msg.id}">🗑️</button>
                    </div>`;
                } else {
                    actionsHtml = `<div class="message-actions">
                        <button class="reply-action" data-id="${msg.id}" data-username="${escapeHtml(msg.username)}" data-text="${escapeHtml(msg.text)}" data-thumb="${msg.file_url && msg.file_type?.startsWith('image/') ? msg.file_url : ''}">↩️ پاسخ</button>
                        <button class="pin-action" data-id="${msg.id}">📌 پین</button>
                    </div>`;
                }
                if (isTaha && !msg.deleted) actionsHtml += `<button class="copy-msg" data-text="${escapeHtml(msg.text)}">📋</button>`;
            }
            let replyHtml = '';
            if (msg.reply_preview && !msg.deleted) {
                let thumbHtml = '';
                if (msg.reply_thumb) thumbHtml = `<img src="${msg.reply_thumb}" style="width:28px;height:28px;border-radius:8px;">`;
                replyHtml = `<div class="message-reply">${thumbHtml}<span><strong>${escapeHtml(msg.reply_preview.username)}:</strong> ${escapeHtml(msg.reply_preview.text)}</span></div>`;
            }
            let editedBadge = (msg.edited && !msg.deleted) ? '<span class="edited-badge">(ویرایش شده)</span>' : '';
            let contentText = '';
            if (msg.deleted && !isDelAdmin) contentText = '⚠️ پیام حذف شده است.';
            else contentText = escapeHtml(msg.text);
            let isSticker = msg.text && msg.text.startsWith('🎨 استیکر: ');
            let stickerContent = '';
            if (isSticker && !msg.deleted) {
                const stickerValue = msg.text.replace('🎨 استیکر: ', '');
                // اگر استیکر تصویری است (آدرس فایل)، نمایش تصویر
                if (stickerValue.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                    stickerContent = `<div class="message-sticker"><img src="stickers/${stickerValue}" style="max-width:100px; max-height:100px; border-radius:12px;"></div>`;
                } else {
                    stickerContent = `<div class="message-sticker">${stickerValue}</div>`;
                }
                contentText = '';
            }
            let reactionsHtml = '';
            if (!msg.deleted && msg.reactions && Object.keys(msg.reactions).length) {
                reactionsHtml = '<div class="message-reactions">';
                for (const [emoji, users] of Object.entries(msg.reactions)) {
                    const active = users.includes(currentUser) ? 'active' : '';
                    reactionsHtml += `<button class="reaction-btn ${active}" data-id="${msg.id}" data-emoji="${emoji}">${emoji} <span class="reaction-count">${users.length}</span></button>`;
                }
                reactionsHtml += '</div>';
            }
            let content = `
                <div class="message-header">
                    <span class="message-username">${escapeHtml(msg.username)}</span>
                    <span class="message-time">${msg.time_str}</span>
                    ${actionsHtml}
                </div>
                ${replyHtml}
                <div class="message-text">${contentText}${editedBadge}</div>
                ${stickerContent}
            `;
            if (!msg.deleted && msg.file_url) {
                const url = msg.file_url, type = msg.file_type || '';
                if (type.startsWith('image/')) content += `<div class="message-attachment"><img src="${url}" onclick="window.open('${url}')"></div>`;
                else if (type.startsWith('video/')) content += `<div class="message-attachment"><video controls src="${url}"></video></div>`;
                else if (type.startsWith('audio/')) content += `<div class="message-attachment"><audio controls src="${url}"></audio></div>`;
                else content += `<div class="message-attachment"><a href="${url}" target="_blank">📁 دانلود فایل</a></div>`;
            }
            content += reactionsHtml;
            bubble.innerHTML = content;
            container.appendChild(bubble);
            bubble.ondblclick = () => {
                if (msg.deleted) return;
                const fd = new FormData(); fd.append('id', msg.id); fd.append('emoji', '❤️');
                apiCall('react', fd).then(() => loadMessages());
            };
        });
    }
    attachMessageEvents();
    if (wasAtBottom && !userScrolledUp) container.scrollTop = container.scrollHeight;
    else container.scrollTop = oldTop;
}

// ========== بارگذاری پیام‌ها ==========
async function loadMessages() {
    const res = await apiCall('get_messages');
    if (res.error === 'unauthorized') { location.reload(); return; }
    const newMsgs = res.messages || [];
    if (currentUser && newMsgs.length > messagesCache.length && document.hidden) {
        const last = newMsgs[newMsgs.length-1];
        if (last && last.id !== lastNotifiedMessageId && last.username !== currentUser && !last.deleted && last.username !== '🎮 سیستم') {
            if (Notification.permission === 'granted') {
                new Notification(`پیام جدید از ${last.username}`, { body: last.text || 'فایل ارسال شده' });
                lastNotifiedMessageId = last.id;
            }
        }
    }
    messagesCache = newMsgs;
    pinnedMsg = res.pinned;
    renderMessages();
}

// ========== نظرسنجی ==========
async function loadPolls() {
    const res = await apiCall('get_polls');
    if (res.polls) polls = res.polls;
}
async function refreshPollsModal() {
    const container = document.getElementById('polls-modal-list');
    if (!container) return;
    if (!polls.length) container.innerHTML = '<p>نظرسنجی فعالی وجود ندارد</p>';
    else {
        container.innerHTML = '';
        for (const poll of polls) {
            const totalVotes = poll.votes.reduce((s,a)=>s+a.length,0);
            const pollDiv = document.createElement('div'); pollDiv.className = 'poll-item-modal';
            pollDiv.innerHTML = `<div class="poll-question-modal">${escapeHtml(poll.question)}</div>`;
            poll.options.forEach((opt, idx) => {
                const votes = poll.votes[idx].length;
                const percent = totalVotes===0 ? 0 : (votes/totalVotes)*100;
                const userVoted = poll.votes[idx].includes(currentUser);
                pollDiv.innerHTML += `
                    <div class="poll-option-modal" data-poll-id="${poll.id}" data-opt-index="${idx}">
                        <span style="min-width:80px;">${escapeHtml(opt)}</span>
                        <div class="poll-option-bar-modal"><div class="poll-option-fill-modal" style="width:${percent}%;"></div></div>
                        <span class="poll-option-percent-modal">${Math.round(percent)}% (${votes})</span>
                        ${userVoted ? '✅' : ''}
                    </div>
                `;
            });
            if (isTaha) {
                const delBtn = document.createElement('button'); delBtn.innerText = '🗑️ حذف'; delBtn.className = 'delete-poll-btn';
                delBtn.onclick = async () => {
                    if (confirm('حذف نظرسنجی؟')) {
                        const fd = new FormData(); fd.append('poll_id', poll.id);
                        const res = await apiCall('delete_poll', fd);
                        if (res.ok) { await loadPolls(); refreshPollsModal(); }
                        else alert(res.error);
                    }
                };
                pollDiv.appendChild(delBtn);
            }
            container.appendChild(pollDiv);
        }
        document.querySelectorAll('.poll-option-modal').forEach(el => {
            el.onclick = async (e) => {
                e.stopPropagation();
                const fd = new FormData(); fd.append('poll_id', el.dataset.pollId); fd.append('option_index', el.dataset.optIndex);
                const res = await apiCall('vote_poll', fd);
                if (res.ok) { await loadPolls(); refreshPollsModal(); }
                else alert(res.error);
            };
        });
    }
}
async function showPollsModal() {
    const modal = document.getElementById('polls-modal');
    await refreshPollsModal();
    modal.classList.remove('hidden');
}

// ========== بازی ==========
async function gameStart() {
    const res = await apiCall('game_start');
    if (res.ok) { if (res.waiting) { alert('درخواست بازی ارسال شد. منتظر حریف...'); checkGameStatus(); } }
    else alert(res.error);
}
async function gameJoin() {
    const res = await apiCall('game_join');
    if (res.ok) { alert('به بازی پیوستید. انتخاب کنید!'); showGameChoiceModal(); }
    else alert(res.error);
}
function checkGameStatus() {
    if (gamePolling) clearInterval(gamePolling);
    gamePolling = setInterval(async () => {
        const res = await apiCall('game_status');
        if (res.game && res.game.status === 'playing') {
            if ((res.game.challenger === currentUser || res.game.opponent === currentUser) && !res.game.choices[currentUser]) showGameChoiceModal();
        } else if (!res.game || res.game.status === 'finished') { clearInterval(gamePolling); gamePolling = null; }
    }, 1000);
}
function showGameChoiceModal() { document.getElementById('game-choice-modal').classList.remove('hidden'); }
async function sendGameChoice(choice) {
    const fd = new FormData(); fd.append('choice', choice);
    const res = await apiCall('game_choice', fd);
    if (res.ok) {
        document.getElementById('game-choice-modal').classList.add('hidden');
        if (res.finished) { alert(`نتیجه: ${res.result}`); if (gamePolling) clearInterval(gamePolling); gamePolling = null; }
        else alert('انتخاب ثبت شد. منتظر حریف...');
    } else alert(res.error);
}

// ========== ارسال پیام ==========
async function sendMessage(text, file = null, replyId = null, isSticker = false) {
    if (file) {
        try {
            await uploadFileWithProgress(file, replyId);
            if (replyId) cancelReply();
            loadMessages(); clearDraft();
        } catch(err) { alert('خطا: ' + err); }
        return;
    }
    const fd = new FormData();
    fd.append('text', text || '');
    if (replyId) fd.append('reply_to', replyId);
    if (currentPrivateChat) fd.append('to', currentPrivateChat);
    if (isSticker) fd.append('is_sticker', 'true');
    const res = await apiCall('send', fd);
    if (res.ok) {
        document.getElementById('message-text').value = '';
        if (replyId) cancelReply();
        loadMessages(); clearDraft();
    } else alert(res.error || 'خطا در ارسال');
}
function cancelReply() {
    replyToMsg = null;
    document.getElementById('reply-indicator').style.display = 'none';
    document.getElementById('reply-thumb').style.display = 'none';
}

// ========== چت خصوصی ==========
function startPrivateChat(username) {
    currentPrivateChat = username;
    document.getElementById('private-chat-username').innerText = username;
    document.getElementById('private-chat-bar').style.display = 'flex';
    document.getElementById('message-text').placeholder = `پیام به ${username}...`;
    loadMessages();
}
function closePrivateChat() {
    currentPrivateChat = null;
    document.getElementById('private-chat-bar').style.display = 'none';
    document.getElementById('message-text').placeholder = 'پیام خود را بنویسید...';
    loadMessages();
}

// ========== آواتار ==========
async function uploadAvatar(file) {
    const fd = new FormData(); fd.append('avatar', file);
    const res = await apiCall('upload_avatar', fd);
    if (res.ok) document.getElementById('user-avatar').style.backgroundImage = `url('${res.avatar}?t=${Date.now()}')`;
    else alert(res.error);
}

// ========== تایپ ==========
if (document.getElementById('message-text')) {
    document.getElementById('message-text').addEventListener('input', () => {
        saveDraft();
        if (currentTypingTimeout) clearTimeout(currentTypingTimeout);
        const fd = new FormData(); fd.append('typing', 'true');
        apiCall('typing', fd);
        currentTypingTimeout = setTimeout(() => {
            const fd2 = new FormData(); fd2.append('typing', 'false');
            apiCall('typing', fd2);
        }, 1000);
    });
}
async function loadTypingStatus() {
    const res = await apiCall('get_typing');
    if (res.typing && res.typing.length) {
        const typingUsers = res.typing.filter(u => u !== currentUser);
        const div = document.getElementById('typing-status');
        if (typingUsers.length) { div.innerText = typingUsers.join(', ') + ' در حال تایپ...'; div.classList.remove('hidden'); }
        else div.classList.add('hidden');
    } else document.getElementById('typing-status')?.classList.add('hidden');
}

// ========== آنلاین‌ها ==========
async function loadOnlineUsers() {
    const res = await apiCall('get_online');
    if (res.users) {
        const list = document.getElementById('online-list');
        list.innerHTML = '';
        res.users.forEach(u => {
            const li = document.createElement('li');
            const avatar = document.createElement('div'); avatar.className = 'online-avatar'; avatar.style.backgroundImage = `url('${u.avatar}')`;
            const name = document.createElement('span'); name.textContent = u.username;
            const btn = document.createElement('button'); btn.textContent = '💬'; btn.className = 'private-chat-btn'; btn.title = 'پیام خصوصی';
            btn.onclick = () => startPrivateChat(u.username);
            li.appendChild(avatar); li.appendChild(name); li.appendChild(btn);
            list.appendChild(li);
        });
        updateTitle(res.users.length);
    }
}

// ========== استیکرهای تصویری (بارگذاری از سرور) ==========
async function loadStickers() {
    const container = document.getElementById('sticker-panel');
    if (!container) return;
    const res = await apiCall('get_stickers');
    if (res.stickers && res.stickers.length) {
        container.innerHTML = '';
        res.stickers.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'sticker-img';
            img.style.width = '60px';
            img.style.cursor = 'pointer';
            img.style.margin = '5px';
            img.onclick = () => {
                // ارسال نام فایل به عنوان متن استیکر
                const fileName = url.split('/').pop();
                sendMessage(fileName, null, replyToMsg ? replyToMsg.id : null, true);
                stickerPanel.classList.add('hidden');
                cancelReply();
            };
            container.appendChild(img);
        });
    } else {
        // fallback به ایموجی
        const fallback = ['😀', '😂', '❤️', '👍', '🎉', '😢', '🔥', '😍', '😎', '🤣', '💔', '🙏'];
        container.innerHTML = '';
        fallback.forEach(emoji => {
            const div = document.createElement('div');
            div.className = 'sticker-img';
            div.textContent = emoji;
            div.style.fontSize = '3rem';
            div.style.cursor = 'pointer';
            div.style.margin = '5px';
            div.onclick = () => {
                sendMessage(emoji, null, replyToMsg ? replyToMsg.id : null, true);
                stickerPanel.classList.add('hidden');
                cancelReply();
            };
            container.appendChild(div);
        });
    }
}

// ========== ایموجی و استیکر ==========
const emojiBtn = document.getElementById('emoji-btn');
const emojiPanel = document.getElementById('emoji-panel');
if (emojiBtn) {
    emojiBtn.onclick = () => {
        emojiPanel.classList.toggle('hidden');
        document.getElementById('sticker-panel')?.classList.add('hidden');
    };
    document.querySelectorAll('.emoji').forEach(span => {
        span.onclick = () => {
            const input = document.getElementById('message-text');
            input.value += span.innerText;
            input.focus();
            saveDraft();
            emojiPanel.classList.add('hidden');
        };
    });
}
const stickerBtn = document.getElementById('sticker-btn');
const stickerPanel = document.getElementById('sticker-panel');
if (stickerBtn) {
    stickerBtn.onclick = () => {
        stickerPanel.classList.toggle('hidden');
        if (emojiPanel) emojiPanel.classList.add('hidden');
        if (stickerPanel.classList.contains('hidden') === false) loadStickers(); // بارگذاری هنگام باز شدن
    };
}
document.addEventListener('click', (e) => {
    if (emojiBtn && emojiPanel && !emojiBtn.contains(e.target) && !emojiPanel.contains(e.target)) emojiPanel.classList.add('hidden');
    if (stickerBtn && stickerPanel && !stickerBtn.contains(e.target) && !stickerPanel.contains(e.target)) stickerPanel.classList.add('hidden');
});

// ========== تم ==========
const themeBtns = document.querySelectorAll('.theme-btn');
if (themeBtns.length) {
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            if (theme === 'dark') document.body.classList.add('dark-theme');
            else document.body.classList.remove('dark-theme');
            themeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            localStorage.setItem('chat_theme', theme);
        });
    });
    if (localStorage.getItem('chat_theme') === 'dark') {
        document.body.classList.add('dark-theme');
        document.querySelector('.theme-btn[data-theme="dark"]')?.classList.add('active');
    }
}

// ========== مودال پین ==========
function showPinnedModal() {
    const modal = document.getElementById('pinned-modal');
    const content = document.getElementById('pinned-modal-content');
    if (pinnedMsg && !pinnedMsg.deleted) {
        content.innerHTML = `<div class="message-bubble" style="max-width:100%;"><div class="message-header"><span class="message-username">${escapeHtml(pinnedMsg.username)}</span><span class="message-time">${pinnedMsg.time_str}</span></div><div class="message-text">${escapeHtml(pinnedMsg.text)}</div></div>`;
    } else content.innerHTML = '<p>پیام پین شده‌ای وجود ندارد.</p>';
    modal.classList.remove('hidden');
}
async function unpinFromModal() {
    const res = await apiCall('unpin');
    if (res.ok) { await loadMessages(); document.getElementById('pinned-modal').classList.add('hidden'); }
    else alert(res.error);
}
function showCreatePollModal() {
    document.getElementById('poll-modal').classList.remove('hidden');
    document.getElementById('poll-question').value = '';
    document.getElementById('poll-options-list').innerHTML = '<input type="text" class="poll-option" placeholder="گزینه ۱"><input type="text" class="poll-option" placeholder="گزینه ۲">';
}

// ========== پاک کردن کل چت ==========
const clearAllBtn = document.getElementById('clear-all-btn');
if (clearAllBtn) {
    clearAllBtn.onclick = async () => {
        if (confirm('همه پیام‌ها برای همیشه پاک شوند؟')) {
            const res = await apiCall('clear_all_messages');
            if (res.ok) { loadMessages(); alert('تمام پیام‌ها پاک شدند.'); }
            else alert(res.error);
        }
    };
}

// ========== راه‌اندازی چت ==========
if (document.getElementById('messages-area')) {
    (async () => {
        const res = await apiCall('check');
        if (res.loggedIn) {
            currentUser = res.user;
            document.getElementById('current-username').innerText = currentUser;
            loadDraft();
            await loadMessages();
            await loadOnlineUsers();
            await loadPolls();
            restoreScrollPosition();
            pollingInterval = setInterval(() => { loadMessages(); loadOnlineUsers(); loadPolls(); }, 2000);
            typingInterval = setInterval(loadTypingStatus, 2000);
        } else location.reload();
    })();
    const sendBtn = document.getElementById('send-text-btn');
    const msgInput = document.getElementById('message-text');
    sendBtn.onclick = () => { const text = msgInput.value.trim(); if (text) sendMessage(text, null, replyToMsg?.id); };
    msgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendBtn.click(); });
    document.getElementById('file-input').onchange = (e) => { if (e.target.files.length) sendMessage('', e.target.files[0], replyToMsg?.id); e.target.value = ''; };
    document.getElementById('cancel-reply-btn').onclick = cancelReply;
    document.getElementById('logout-btn').onclick = async () => { if (gamePolling) clearInterval(gamePolling); await apiCall('logout'); location.reload(); };
    document.getElementById('close-private-chat').onclick = closePrivateChat;
    const msgArea = document.getElementById('messages-area');
    msgArea.addEventListener('scroll', () => {
        const scrollPos = msgArea.scrollTop;
        const maxScroll = msgArea.scrollHeight - msgArea.clientHeight;
        userScrolledUp = (scrollPos < maxScroll - 30);
        if (currentUser) localStorage.setItem('chat_scroll_' + currentUser, scrollPos);
    });
    document.getElementById('show-pinned-btn').onclick = showPinnedModal;
    document.getElementById('show-polls-btn').onclick = showPollsModal;
    document.getElementById('unpin-from-modal').onclick = unpinFromModal;
    document.getElementById('create-poll-modal-btn').onclick = showCreatePollModal;
    document.getElementById('game-btn').onclick = async () => {
        const status = await apiCall('game_status');
        if (status.game && status.game.status === 'waiting') {
            if (status.game.challenger !== currentUser) gameJoin();
            else alert('شما درخواست داده‌اید، منتظر حریف باشید.');
        } else if (status.game && status.game.status === 'playing') alert('در حال حاضر یک بازی در جریان است.');
        else gameStart();
    };
    document.getElementById('choice-rock').onclick = () => sendGameChoice('rock');
    document.getElementById('choice-paper').onclick = () => sendGameChoice('paper');
    document.getElementById('choice-scissors').onclick = () => sendGameChoice('scissors');
    document.getElementById('upload-avatar-btn').onclick = () => document.getElementById('avatar-input').click();
    document.getElementById('avatar-input').onchange = (e) => { if (e.target.files.length) uploadAvatar(e.target.files[0]); e.target.value = ''; };
    document.querySelectorAll('.close-modal, .close-pinned, .close-polls, .close-game').forEach(btn => {
        btn.onclick = () => {
            document.getElementById('pinned-modal')?.classList.add('hidden');
            document.getElementById('polls-modal')?.classList.add('hidden');
            document.getElementById('poll-modal')?.classList.add('hidden');
            document.getElementById('game-choice-modal')?.classList.add('hidden');
        };
    });
    window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.classList.add('hidden'); };
    const searchInputElem = document.getElementById('search-input');
    if (searchInputElem) {
        let timeout;
        searchInputElem.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => { searchQuery = e.target.value.trim(); renderMessages(); }, 300);
        });
        const searchContainer = searchInputElem.parentElement;
        if (searchContainer && !document.getElementById('clear-search')) {
            const clearBtn = document.createElement('button'); clearBtn.id = 'clear-search'; clearBtn.innerText = '✖';
            clearBtn.onclick = () => { searchInputElem.value = ''; searchQuery = ''; renderMessages(); searchInputElem.focus(); };
            searchContainer.style.position = 'relative'; searchContainer.appendChild(clearBtn);
        }
    }
}

// ========== صفحه لاگین ==========
if (document.getElementById('login-btn')) {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (btn.dataset.tab === 'login') { loginForm.classList.add('active'); regForm.classList.remove('active'); }
            else { regForm.classList.add('active'); loginForm.classList.remove('active'); }
        });
    });
    document.getElementById('login-btn').onclick = async () => {
        const fd = new FormData(); fd.append('username', document.getElementById('login-username').value.trim()); fd.append('password', document.getElementById('login-password').value);
        const res = await apiCall('login', fd);
        if (res.ok) location.reload(); else document.getElementById('login-error').innerText = res.error;
    };
    document.getElementById('register-btn').onclick = async () => {
        const fd = new FormData(); fd.append('username', document.getElementById('reg-username').value.trim()); fd.append('password', document.getElementById('reg-password').value);
        const res = await apiCall('register', fd);
        if (res.ok) alert('ثبت‌نام موفق! اکنون وارد شوید.'); else document.getElementById('reg-error').innerText = res.error;
    };
}

// ========== دکمه ایجاد نظرسنجی ==========
document.getElementById('create-poll-btn')?.addEventListener('click', showCreatePollModal);
document.getElementById('add-option-btn')?.addEventListener('click', () => {
    const container = document.getElementById('poll-options-list');
    if (container.children.length < 4) {
        const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'poll-option'; inp.placeholder = `گزینه ${container.children.length+1}`;
        container.appendChild(inp);
    } else alert('حداکثر ۴ گزینه');
});
document.getElementById('create-poll-submit')?.addEventListener('click', async () => {
    const question = document.getElementById('poll-question').value.trim();
    const inputs = document.querySelectorAll('#poll-options-list .poll-option');
    const options = Array.from(inputs).map(inp => inp.value.trim()).filter(v=>v);
    if (question.length<3 || options.length<2) { alert('سوال (حداقل ۳ حرف) و حداقل ۲ گزینه'); return; }
    const fd = new FormData(); fd.append('question', question); options.forEach(opt => fd.append('options[]', opt));
    const res = await apiCall('create_poll', fd);
    if (res.ok) {
        document.getElementById('poll-modal').classList.add('hidden');
        await loadPolls();
        if (!document.getElementById('polls-modal').classList.contains('hidden')) refreshPollsModal();
    } else alert(res.error);
});