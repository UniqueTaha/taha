<?php
session_start();
date_default_timezone_set('Asia/Tehran');

error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('upload_max_filesize', '10M');
ini_set('post_max_size', '10M');

define('MAX_FILE_SIZE', 10 * 1024 * 1024);
define('UPLOAD_DIR', __DIR__ . '/uploads/');
define('AVATAR_DIR', __DIR__ . '/avatars/');
define('STICKER_DIR', __DIR__ . '/stickers/');

// ایجاد پوشه‌های مورد نیاز
$dirs = [UPLOAD_DIR, AVATAR_DIR, STICKER_DIR];
foreach ($dirs as $dir) {
    if (!is_dir($dir)) mkdir($dir, 0777, true);
}

// فایل‌های داده
$messagesFile = __DIR__ . '/messages.json';
$usersFile = __DIR__ . '/users.json';
$onlineFile = __DIR__ . '/online.json';
$typingFile = __DIR__ . '/typing.json';
$pinnedFile = __DIR__ . '/pinned.json';
$pollsFile = __DIR__ . '/polls.json';
$gameFile = __DIR__ . '/game.json';

foreach ([$messagesFile, $usersFile, $onlineFile, $typingFile, $pinnedFile, $pollsFile, $gameFile] as $file) {
    if (!file_exists($file)) file_put_contents($file, json_encode([]));
}

// آواتار پیش‌فرض
if (!file_exists(AVATAR_DIR . 'default.jpg')) {
    if (function_exists('imagecreate')) {
        $img = imagecreate(1, 1);
        imagecolorallocate($img, 200, 200, 200);
        imagejpeg($img, AVATAR_DIR . 'default.jpg');
    } else {
        file_put_contents(AVATAR_DIR . 'default.jpg', '');
    }
}

// ========== توابع ==========
function readJSON($file) {
    if (!file_exists($file)) return [];
    $data = file_get_contents($file);
    return json_decode($data, true) ?: [];
}
function writeJSON($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
    return true;
}

function getUsers() { global $usersFile; return readJSON($usersFile); }
function saveUsers($users) { global $usersFile; writeJSON($usersFile, $users); }
function getMessages() { global $messagesFile; return readJSON($messagesFile); }
function saveMessages($msgs) { global $messagesFile; writeJSON($messagesFile, $msgs); }
function getPinned() { global $pinnedFile; return readJSON($pinnedFile); }
function setPinned($msg) { global $pinnedFile; writeJSON($pinnedFile, $msg); }
function getPolls() { global $pollsFile; return readJSON($pollsFile); }
function savePolls($polls) { global $pollsFile; writeJSON($pollsFile, $polls); }

function getUserAvatar($username) {
    $exts = ['jpg', 'jpeg', 'png', 'gif'];
    foreach ($exts as $ext) {
        $file = AVATAR_DIR . md5($username) . '.' . $ext;
        if (file_exists($file)) return 'avatars/' . md5($username) . '.' . $ext;
    }
    return 'avatars/default.jpg';
}
function updateUserAvatar($username, $file) {
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg','jpeg','png','gif'])) return false;
    foreach (['jpg','jpeg','png','gif'] as $e) {
        $old = AVATAR_DIR . md5($username) . '.' . $e;
        if (file_exists($old)) unlink($old);
    }
    $target = AVATAR_DIR . md5($username) . '.' . $ext;
    return move_uploaded_file($file['tmp_name'], $target);
}

function updateOnlineStatus($username) {
    global $onlineFile;
    $online = readJSON($onlineFile);
    $online[$username] = time();
    $online = array_filter($online, fn($t) => (time() - $t) < 12);
    writeJSON($onlineFile, $online);
}
function getOnlineUsers() { global $onlineFile; return array_keys(readJSON($onlineFile)); }

function updateTyping($username, $isTyping) {
    global $typingFile;
    $typing = readJSON($typingFile);
    if ($isTyping) $typing[$username] = time();
    else unset($typing[$username]);
    $typing = array_filter($typing, fn($t) => (time() - $t) < 3);
    writeJSON($typingFile, $typing);
}
function getTypingUsers() { global $typingFile; return array_keys(readJSON($typingFile)); }

// ========== API ==========
$action = $_GET['action'] ?? '';
if ($action) {
    header('Content-Type: application/json');
    
    // ثبت‌نام
    if ($action === 'register') {
        $username = trim($_POST['username'] ?? '');
        $password = $_POST['password'] ?? '';
        if (strlen($username) < 3 || strlen($password) < 4) {
            echo json_encode(['ok' => false, 'error' => 'نام کاربری (حداقل ۳) و رمز (حداقل ۴)']);
            exit;
        }
        $users = getUsers();
        if (isset($users[$username])) {
            echo json_encode(['ok' => false, 'error' => 'نام کاربری تکراری']);
            exit;
        }
        $users[$username] = password_hash($password, PASSWORD_DEFAULT);
        saveUsers($users);
        echo json_encode(['ok' => true]);
        exit;
    }
    
    // ورود
    if ($action === 'login') {
        $username = trim($_POST['username'] ?? '');
        $password = $_POST['password'] ?? '';
        $users = getUsers();
        if (isset($users[$username]) && password_verify($password, $users[$username])) {
            $_SESSION['user'] = $username;
            echo json_encode(['ok' => true]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'نام کاربری یا رمز اشتباه']);
        }
        exit;
    }
    
    // خروج
    if ($action === 'logout') {
        session_destroy();
        echo json_encode(['ok' => true]);
        exit;
    }
    
    // بررسی وضعیت
    if ($action === 'check') {
        if (isset($_SESSION['user'])) updateOnlineStatus($_SESSION['user']);
        echo json_encode(['loggedIn' => isset($_SESSION['user']), 'user' => $_SESSION['user'] ?? null]);
        exit;
    }
    
    // دریافت آنلاین‌ها همراه با آواتار
    if ($action === 'get_online') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $users = getOnlineUsers();
        $result = [];
        foreach ($users as $u) {
            $result[] = ['username' => $u, 'avatar' => getUserAvatar($u)];
        }
        echo json_encode(['users' => $result]);
        exit;
    }
    
    // دریافت تایپ
    if ($action === 'get_typing') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        echo json_encode(['typing' => getTypingUsers()]);
        exit;
    }
    
    // ارسال تایپ
    if ($action === 'typing') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $isTyping = ($_POST['typing'] ?? 'false') === 'true';
        updateTyping($_SESSION['user'], $isTyping);
        echo json_encode(['ok' => true]);
        exit;
    }
    
    // آپلود آواتار
    if ($action === 'upload_avatar') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
            echo json_encode(['ok' => false, 'error' => 'خطا در آپلود فایل']);
            exit;
        }
        if (updateUserAvatar($_SESSION['user'], $_FILES['avatar'])) {
            echo json_encode(['ok' => true, 'avatar' => getUserAvatar($_SESSION['user'])]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'فرمت مجاز نیست (jpg, png, gif)']);
        }
        exit;
    }
    
    // دریافت لیست استیکرهای تصویری (جدید)
    if ($action === 'get_stickers') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $stickers = [];
        $files = glob(STICKER_DIR . '*');
        foreach ($files as $file) {
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'])) {
                $stickers[] = 'stickers/' . basename($file);
            }
        }
        echo json_encode(['stickers' => $stickers]);
        exit;
    }
    
    // دریافت پیام‌ها
    if ($action === 'get_messages') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $all = getMessages();
        $user = $_SESSION['user'];
        $filtered = [];
        foreach ($all as $msg) {
            if (empty($msg['to']) || $msg['to'] === $user || $msg['owner'] === $user) {
                if ((time() - $msg['timestamp']) < 86400) {
                    $filtered[] = $msg;
                }
            }
        }
        if ($user !== 'taha') {
            $filtered = array_values(array_filter($filtered, fn($m) => empty($m['deleted'])));
        } else {
            foreach ($filtered as &$msg) {
                if (!empty($msg['deleted']) && isset($msg['original_text'])) {
                    $msg['text'] = '🔒 [حذف شده توسط ' . htmlspecialchars($msg['deleted_by']) . ']: ' . $msg['original_text'];
                    $msg['deleted_display'] = true;
                }
            }
        }
        $pinned = getPinned();
        if ($user !== 'taha' && $pinned && !empty($pinned['deleted'])) $pinned = null;
        echo json_encode(['messages' => $filtered, 'pinned' => $pinned]);
        exit;
    }
    
    // پین کردن پیام
    if ($action === 'pin') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $msgId = $_POST['id'] ?? '';
        $messages = getMessages();
        $found = null;
        foreach ($messages as $msg) {
            if ($msg['id'] == $msgId && empty($msg['deleted'])) {
                $found = $msg;
                break;
            }
        }
        if ($found) {
            setPinned($found);
            echo json_encode(['ok' => true]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'پیام یافت نشد یا حذف شده']);
        }
        exit;
    }
    
    // حذف پین
    if ($action === 'unpin') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        setPinned(null);
        echo json_encode(['ok' => true]);
        exit;
    }
    
    // ارسال پیام
    if ($action === 'send') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $username = $_SESSION['user'];
        $text = trim($_POST['text'] ?? '');
        $replyTo = $_POST['reply_to'] ?? null;
        $toUser = $_POST['to'] ?? null;
        $isSticker = ($_POST['is_sticker'] ?? 'false') === 'true';
        $fileUrl = null;
        $fileType = null;
        
        if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES['file'];
            if ($file['size'] > MAX_FILE_SIZE) {
                echo json_encode(['ok' => false, 'error' => 'حجم فایل بیشتر از ۱۰ مگابایت است']);
                exit;
            }
            $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
            $safeName = time() . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
            $target = UPLOAD_DIR . $safeName;
            if (move_uploaded_file($file['tmp_name'], $target)) {
                $fileUrl = 'uploads/' . $safeName;
                $fileType = $file['type'];
            }
        }
        
        if (empty($text) && !$fileUrl && !$isSticker) {
            echo json_encode(['ok' => false, 'error' => 'متن یا فایل ارسال کنید']);
            exit;
        }
        
        $messages = getMessages();
        $replyPreview = null;
        if ($replyTo) {
            foreach ($messages as $m) {
                if ($m['id'] == $replyTo && empty($m['deleted'])) {
                    $replyPreview = [
                        'id' => $m['id'],
                        'username' => $m['username'],
                        'text' => mb_substr($m['text'], 0, 50) . (mb_strlen($m['text']) > 50 ? '...' : '')
                    ];
                    break;
                }
            }
        }
        
        $newMsg = [
            'id' => time() . rand(1000, 9999),
            'username' => htmlspecialchars($username),
            'owner' => $username,
            'text' => $isSticker ? '🎨 استیکر: ' . htmlspecialchars($text) : htmlspecialchars($text),
            'file_url' => $fileUrl,
            'file_type' => $fileType,
            'timestamp' => time(),
            'time_str' => date('H:i:s'),
            'edited' => false,
            'deleted' => false,
            'deleted_by' => null,
            'original_text' => null,
            'reply_to' => $replyTo,
            'reply_preview' => $replyPreview,
            'reply_thumb' => null,
            'reactions' => [],
            'to' => $toUser ? htmlspecialchars($toUser) : null
        ];
        if ($replyTo) {
            foreach ($messages as $m) {
                if ($m['id'] == $replyTo && $m['file_url'] && strpos($m['file_type'], 'image/') === 0) {
                    $newMsg['reply_thumb'] = $m['file_url'];
                    break;
                }
            }
        }
        $messages[] = $newMsg;
        saveMessages($messages);
        echo json_encode(['ok' => true]);
        exit;
    }
    
    // واکنش
    if ($action === 'react') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $msgId = $_POST['id'] ?? '';
        $emoji = $_POST['emoji'] ?? '';
        if (!$msgId || !$emoji) {
            echo json_encode(['ok' => false, 'error' => 'اطلاعات ناقص']);
            exit;
        }
        $messages = getMessages();
        $found = false;
        foreach ($messages as &$msg) {
            if ($msg['id'] == $msgId && empty($msg['deleted'])) {
                if (!isset($msg['reactions'])) $msg['reactions'] = [];
                if (!isset($msg['reactions'][$emoji])) $msg['reactions'][$emoji] = [];
                $user = $_SESSION['user'];
                if (in_array($user, $msg['reactions'][$emoji])) {
                    $msg['reactions'][$emoji] = array_values(array_filter($msg['reactions'][$emoji], fn($u) => $u !== $user));
                    if (empty($msg['reactions'][$emoji])) unset($msg['reactions'][$emoji]);
                } else {
                    foreach ($msg['reactions'] as $e => $users) {
                        if (in_array($user, $users)) {
                            $msg['reactions'][$e] = array_values(array_filter($msg['reactions'][$e], fn($u) => $u !== $user));
                            if (empty($msg['reactions'][$e])) unset($msg['reactions'][$e]);
                            break;
                        }
                    }
                    $msg['reactions'][$emoji][] = $user;
                }
                $found = true;
                break;
            }
        }
        if ($found) {
            saveMessages($messages);
            echo json_encode(['ok' => true]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'پیام یافت نشد یا حذف شده']);
        }
        exit;
    }
    
    // ویرایش
    if ($action === 'edit') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $msgId = $_POST['id'] ?? '';
        $newText = trim($_POST['text'] ?? '');
        if (!$msgId || !$newText) {
            echo json_encode(['ok' => false, 'error' => 'اطلاعات ناقص']);
            exit;
        }
        $messages = getMessages();
        $found = false;
        foreach ($messages as &$msg) {
            if ($msg['id'] == $msgId && $msg['owner'] === $_SESSION['user'] && empty($msg['deleted'])) {
                $msg['text'] = htmlspecialchars($newText);
                $msg['edited'] = true;
                $found = true;
                break;
            }
        }
        if ($found) {
            saveMessages($messages);
            echo json_encode(['ok' => true]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'پیام یافت نشد یا دسترسی ندارید']);
        }
        exit;
    }
    
    // حذف
    if ($action === 'delete') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $msgId = $_POST['id'] ?? '';
        if (!$msgId) {
            echo json_encode(['ok' => false, 'error' => 'شناسه نامعتبر']);
            exit;
        }
        $messages = getMessages();
        $found = false;
        foreach ($messages as &$msg) {
            if ($msg['id'] == $msgId && $msg['owner'] === $_SESSION['user'] && empty($msg['deleted'])) {
                $msg['original_text'] = $msg['text'];
                $msg['text'] = '';
                $msg['file_url'] = null;
                $msg['deleted'] = true;
                $msg['deleted_by'] = $_SESSION['user'];
                $msg['reactions'] = [];
                $found = true;
                break;
            }
        }
        if ($found) {
            saveMessages($messages);
            echo json_encode(['ok' => true]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'پیام یافت نشد یا دسترسی ندارید']);
        }
        exit;
    }
    
    // پاک کردن کل پیام‌ها (فقط taha)
    if ($action === 'clear_all_messages') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        if ($_SESSION['user'] !== 'taha') {
            echo json_encode(['ok' => false, 'error' => 'دسترسی فقط برای مدیر']);
            exit;
        }
        file_put_contents($messagesFile, json_encode([]));
        setPinned(null);
        echo json_encode(['ok' => true]);
        exit;
    }
    
    // نظرسنجی‌ها
    if ($action === 'create_poll') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $question = trim($_POST['question'] ?? '');
        $options = $_POST['options'] ?? [];
        if (strlen($question) < 3 || count($options) < 2) {
            echo json_encode(['ok' => false, 'error' => 'سوال و حداقل ۲ گزینه لازم است']);
            exit;
        }
        $poll = [
            'id' => time() . rand(1000, 9999),
            'question' => htmlspecialchars($question),
            'options' => array_map('htmlspecialchars', $options),
            'votes' => array_fill(0, count($options), []),
            'created_by' => $_SESSION['user'],
            'created_at' => time(),
            'active' => true
        ];
        $polls = getPolls();
        $polls[] = $poll;
        savePolls($polls);
        echo json_encode(['ok' => true]);
        exit;
    }
    
    if ($action === 'vote_poll') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $pollId = $_POST['poll_id'] ?? '';
        $optIndex = (int)$_POST['option_index'];
        $polls = getPolls();
        foreach ($polls as &$poll) {
            if ($poll['id'] == $pollId && $poll['active']) {
                $user = $_SESSION['user'];
                foreach ($poll['votes'] as $idx => $voters) {
                    if (in_array($user, $voters)) {
                        $poll['votes'][$idx] = array_values(array_filter($voters, fn($u) => $u !== $user));
                        break;
                    }
                }
                if ($optIndex >= 0 && $optIndex < count($poll['options'])) {
                    if (!in_array($user, $poll['votes'][$optIndex])) {
                        $poll['votes'][$optIndex][] = $user;
                    }
                }
                savePolls($polls);
                echo json_encode(['ok' => true]);
                exit;
            }
        }
        echo json_encode(['ok' => false, 'error' => 'نظرسنجی یافت نشد']);
        exit;
    }
    
    if ($action === 'delete_poll') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        if ($_SESSION['user'] !== 'taha') {
            echo json_encode(['ok' => false, 'error' => 'دسترسی فقط برای مدیر']);
            exit;
        }
        $pollId = $_POST['poll_id'] ?? '';
        $polls = getPolls();
        $new = array_filter($polls, fn($p) => $p['id'] != $pollId);
        savePolls(array_values($new));
        echo json_encode(['ok' => true]);
        exit;
    }
    
    if ($action === 'get_polls') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $polls = getPolls();
        $now = time();
        $polls = array_values(array_filter($polls, fn($p) => ($now - $p['created_at']) < 86400));
        echo json_encode(['polls' => $polls]);
        exit;
    }
    
    // بازی سنگ-کاغذ-قیچی
    if ($action === 'game_start') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $game = readJSON($gameFile);
        if ($game && $game['status'] === 'waiting') {
            echo json_encode(['ok' => false, 'error' => 'بازی دیگری در انتظار است']);
            exit;
        }
        $game = [
            'challenger' => $_SESSION['user'],
            'opponent' => null,
            'status' => 'waiting',
            'choices' => [],
            'created_at' => time()
        ];
        writeJSON($gameFile, $game);
        echo json_encode(['ok' => true, 'waiting' => true]);
        exit;
    }
    
    if ($action === 'game_join') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $game = readJSON($gameFile);
        if (!$game || $game['status'] !== 'waiting') {
            echo json_encode(['ok' => false, 'error' => 'هیچ بازی فعالی نیست']);
            exit;
        }
        if ($game['challenger'] === $_SESSION['user']) {
            echo json_encode(['ok' => false, 'error' => 'شما شروع کننده هستید']);
            exit;
        }
        $game['opponent'] = $_SESSION['user'];
        $game['status'] = 'playing';
        writeJSON($gameFile, $game);
        echo json_encode(['ok' => true]);
        exit;
    }
    
    if ($action === 'game_choice') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $choice = $_POST['choice'] ?? '';
        if (!in_array($choice, ['rock','paper','scissors'])) {
            echo json_encode(['ok' => false, 'error' => 'انتخاب نامعتبر']);
            exit;
        }
        $game = readJSON($gameFile);
        if (!$game || $game['status'] !== 'playing') {
            echo json_encode(['ok' => false, 'error' => 'بازی فعالی نیست']);
            exit;
        }
        if ($_SESSION['user'] !== $game['challenger'] && $_SESSION['user'] !== $game['opponent']) {
            echo json_encode(['ok' => false, 'error' => 'شما در این بازی نیستید']);
            exit;
        }
        $game['choices'][$_SESSION['user']] = $choice;
        writeJSON($gameFile, $game);
        if (isset($game['choices'][$game['challenger']]) && isset($game['choices'][$game['opponent']])) {
            $c1 = $game['choices'][$game['challenger']];
            $c2 = $game['choices'][$game['opponent']];
            if ($c1 == $c2) $result = 'مساوی';
            else {
                $winMap = ['rock'=>'scissors', 'paper'=>'rock', 'scissors'=>'paper'];
                $winner = ($winMap[$c1] == $c2) ? $game['challenger'] : $game['opponent'];
                $result = "برنده: $winner";
            }
            $sysMsg = [
                'id' => time() . rand(1000,9999),
                'username' => '🎮 سیستم',
                'owner' => 'system',
                'text' => "بازی سنگ-کاغذ-قیچی: {$game['challenger']} ($c1) vs {$game['opponent']} ($c2) - $result",
                'timestamp' => time(),
                'time_str' => date('H:i:s'),
                'deleted' => false,
                'reactions' => []
            ];
            $msgs = getMessages();
            $msgs[] = $sysMsg;
            saveMessages($msgs);
            writeJSON($gameFile, null);
            echo json_encode(['ok' => true, 'finished' => true, 'result' => $result]);
            exit;
        }
        echo json_encode(['ok' => true, 'finished' => false]);
        exit;
    }
    
    if ($action === 'game_status') {
        if (!isset($_SESSION['user'])) { echo json_encode(['error' => 'unauthorized']); exit; }
        $game = readJSON($gameFile);
        if ($game && $game['status'] !== 'finished' && (time() - $game['created_at']) > 60) {
            writeJSON($gameFile, null);
            $game = null;
        }
        echo json_encode(['game' => $game]);
        exit;
    }
    
    echo json_encode(['error' => 'action not found']);
    exit;
}

$loggedIn = isset($_SESSION['user']);
$isTaha = ($loggedIn && $_SESSION['user'] === 'taha');
?>
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>چت سبز </title>
    <link rel="stylesheet" href="style.css">
    <?php if (!$isTaha): ?>
    <style>
        body { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }
        img, video, audio { pointer-events: none; -webkit-touch-callout: none; }
        ::selection { background: transparent; }
        ::-moz-selection { background: transparent; }
        img { -webkit-user-drag: none; user-drag: none; }
    </style>
    <?php endif; ?>
</head>
<body oncontextmenu="<?php echo $isTaha ? 'return true' : 'return false'; ?>">
<div id="app">
    <?php if (!$loggedIn): ?>
    <div class="auth-container glass-card">
        <div class="auth-header"><h1>🍃 چت سبز</h1><p>پیام‌رسان امن و خصوصی</p></div>
        <div class="auth-tabs"><button class="tab-btn active" data-tab="login">ورود</button><button class="tab-btn" data-tab="register">ثبت‌نام</button></div>
        <div id="login-form" class="auth-form active">
            <input type="text" id="login-username" placeholder="نام کاربری"><input type="password" id="login-password" placeholder="رمز عبور">
            <button id="login-btn">ورود به چت</button><div class="error-msg" id="login-error"></div>
        </div>
        <div id="register-form" class="auth-form">
            <input type="text" id="reg-username" placeholder="نام کاربری (حداقل ۳ حرف)"><input type="password" id="reg-password" placeholder="رمز عبور (حداقل ۴ حرف)">
            <button id="register-btn">ساخت حساب کاربری</button><div class="error-msg" id="reg-error"></div>
        </div>
    </div>
    <?php else: ?>
    <div class="chat-wrapper">
        <div class="chat-sidebar glass-card">
            <div class="user-info">
                <div class="avatar" id="user-avatar" style="background-image: url('<?php echo getUserAvatar($_SESSION['user']); ?>'); background-size: cover;"></div>
                <div class="user-details"><strong id="current-username"><?php echo htmlspecialchars($_SESSION['user']); ?></strong><span class="status online"><?php echo $isTaha ? 'مدیر' : 'آنلاین'; ?></span></div>
                <button id="upload-avatar-btn" class="icon-btn" title="تغییر عکس">📷</button><input type="file" id="avatar-input" accept="image/*" style="display:none">
                <button id="logout-btn" class="logout-icon" title="خروج">🚪</button>
            </div>
            <div class="online-users"><h4>📡 آنلاین‌ها</h4><ul id="online-list"></ul></div>
            <?php if ($_SESSION['user'] === 'taha'): ?><button id="clear-all-btn" class="clear-all-btn">🗑️ پاک کردن کل چت</button><?php endif; ?>
            <button id="game-btn" class="action-btn" style="margin-top:10px;">🎮 بازی سنگ-کاغذ-قیچی</button>
            <div class="theme-selector"><span>🎨 تم:</span><button class="theme-btn active" data-theme="green">سبز</button><button class="theme-btn" data-theme="dark">تیره</button></div>
        </div>
        <div class="chat-main">
            <div class="private-chat-bar" id="private-chat-bar" style="display:none;"><span>💬 در حال چت خصوصی با <span id="private-chat-username"></span></span><button id="close-private-chat" class="close-private">✖ بازگشت به عمومی</button></div>
            <div class="search-bar"><input type="text" id="search-input" placeholder="🔍 جستجو در پیام‌ها..."></div>
            <div class="messages-area" id="messages-area"><div class="loading-msg">در حال بارگذاری...</div></div>
            <div class="input-panel glass-card">
                <div class="reply-indicator" id="reply-indicator" style="display:none;"><div class="reply-thumb" id="reply-thumb" style="display:none;"><img id="reply-thumb-img" src=""></div><span>📌 پاسخ به: <span id="reply-preview-text"></span></span><button id="cancel-reply-btn" class="cancel-reply">✖</button></div>
                <div class="input-row"><input type="text" id="message-text" placeholder="پیام خود را بنویسید..."><button id="send-text-btn" class="send-btn">📨 ارسال</button></div>
                <div class="input-actions">
                    <label for="file-input" class="action-btn">📎 فایل (حداکثر 10 مگ)</label><input type="file" id="file-input" accept="*/*" style="display:none">
                    <button id="emoji-btn" class="action-btn">😊 ایموجی</button><button id="sticker-btn" class="action-btn">🎨 استیکر</button>
                    <button id="create-poll-btn" class="action-btn">📊 نظرسنجی</button><div id="typing-status" class="typing-status hidden"></div>
                </div>
                <div id="emoji-panel" class="emoji-panel hidden"><span class="emoji">😊</span><span class="emoji">😂</span><span class="emoji">❤️</span><span class="emoji">👍</span><span class="emoji">🎉</span><span class="emoji">😢</span><span class="emoji">🔥</span><span class="emoji">😍</span><span class="emoji">😎</span><span class="emoji">🤣</span><span class="emoji">💔</span><span class="emoji">🙏</span></div>
                <div id="sticker-panel" class="sticker-panel hidden"></div>
                <div id="upload-progress" class="upload-progress hidden"><div class="progress-bar"><div id="progress-fill" style="width:0%"></div></div><span id="progress-percent">0%</span></div>
            </div>
        </div>
    </div>
    <div class="floating-buttons"><button id="show-pinned-btn" class="float-btn">📌 پین شده</button><button id="show-polls-btn" class="float-btn">📊 نظرسنجی‌ها</button></div>
    <div id="pinned-modal" class="modal hidden"><div class="modal-content glass-card"><span class="close-modal close-pinned">&times;</span><h3>📌 پیام پین شده</h3><div id="pinned-modal-content"></div><button id="unpin-from-modal" class="small-btn">حذف پین</button></div></div>
    <div id="polls-modal" class="modal hidden"><div class="modal-content glass-card modal-large"><span class="close-modal close-polls">&times;</span><h3>📊 نظرسنجی‌های فعال</h3><div id="polls-modal-list"></div><button id="create-poll-modal-btn" class="send-btn">➕ نظرسنجی جدید</button></div></div>
    <div id="poll-modal" class="modal hidden"><div class="modal-content glass-card"><span class="close-modal">&times;</span><h3>ایجاد نظرسنجی جدید</h3><input type="text" id="poll-question" placeholder="سوال..."><div id="poll-options-list"><input type="text" class="poll-option" placeholder="گزینه ۱"><input type="text" class="poll-option" placeholder="گزینه ۲"></div><button id="add-option-btn" class="small-btn">+ افزودن گزینه</button><button id="create-poll-submit" class="send-btn">ایجاد نظرسنجی</button></div></div>
    <div id="game-choice-modal" class="modal hidden"><div class="modal-content glass-card" style="text-align:center;"><span class="close-modal close-game">&times;</span><h3>انتخاب خود را بزنید</h3><div class="game-choices"><button id="choice-rock" class="game-choice-btn">🪨 سنگ</button><button id="choice-paper" class="game-choice-btn">📄 کاغذ</button><button id="choice-scissors" class="game-choice-btn">✂️ قیچی</button></div><div id="game-status-msg"></div></div></div>
    <?php endif; ?>
</div>
<script>
    window.isTaha = <?php echo json_encode($isTaha); ?>;
</script>
<script src="script.js"></script>
</body>
</html>