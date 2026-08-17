import React, {
  useState,
  useEffect,
  useRef,
  useCallback
} from "react";

import { createRoot } from "react-dom/client";

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  arrayUnion,
  serverTimestamp
} from "firebase/firestore";

import {
  auth,
  db,
  googleProvider
} from "./firebase.js";

import {
  ChevronLeft,
  Search,
  SendHorizontal,
  X,
  Camera,
  Copy,
  Plus,
  Check
} from "lucide-react";

/* =========================
   CONSTANTS
========================= */

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;

const CYAN = "#00B8D9";
const CYAN_DARK = "#008FA8";

const CODE_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/* =========================
   HELPERS
========================= */

function uid() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

function generateCode() {
  let code = "";

  for (let i = 0; i < 6; i++) {
    code +=
      CODE_CHARS[
        Math.floor(
          Math.random() * CODE_CHARS.length
        )
      ];
  }

  return code;
}

function colorForName(name) {
  const colors = [
    "#00B8D9",
    "#00A6C7",
    "#008FA8",
    "#16B8A6",
    "#4C9AFF",
    "#5B6EE1"
  ];

  let hash = 0;
  const value = name || "?";

  for (let i = 0; i < value.length; i++) {
    hash =
      (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return colors[hash % colors.length];
}

function initialsFor(name) {
  const parts = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[1][0]
  ).toUpperCase();
}

function formatRelative(timestamp) {
  const diff = Date.now() - timestamp;

  if (diff < MIN) return "now";

  if (diff < HOUR) {
    return (
      Math.floor(diff / MIN) + "m"
    );
  }

  if (diff < DAY) {
    return (
      Math.floor(diff / HOUR) + "h"
    );
  }

  if (diff < 7 * DAY) {
    return (
      Math.floor(diff / DAY) + "d"
    );
  }

  return new Date(timestamp).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric"
    }
  );
}

function formatDayDivider(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();

  const yesterday = new Date(today);

  yesterday.setDate(
    today.getDate() - 1
  );

  if (
    date.toDateString() ===
    today.toDateString()
  ) {
    return "Today";
  }

  if (
    date.toDateString() ===
    yesterday.toDateString()
  ) {
    return "Yesterday";
  }

  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric"
    }
  );
}

function roomTitle(participants, myId) {
  const others = Object.entries(
    participants || {}
  )
    .filter(
      ([id]) => id !== myId
    )
    .map(
      ([, person]) =>
        person.name || "Someone"
    );

  if (!others.length) {
    return "Waiting for someone…";
  }

  if (others.length === 1) {
    return others[0];
  }

  if (others.length === 2) {
    return others.join(" & ");
  }

  return (
    others
      .slice(0, 2)
      .join(", ") +
    " +" +
    (others.length - 2)
  );
}

/* =========================
   FIRESTORE HELPERS
========================= */

async function getProfile(id) {
  const snapshot = await getDoc(
    doc(db, "users", id)
  );

  return snapshot.exists()
    ? snapshot.data()
    : null;
}

async function saveProfileCloud(
  id,
  data
) {
  await setDoc(
    doc(db, "users", id),
    {
      ...data,
      uid: id,
      updatedAt: serverTimestamp()
    },
    {
      merge: true
    }
  );
}

async function getRoom(code) {
  const snapshot = await getDoc(
    doc(db, "rooms", code)
  );

  return snapshot.exists()
    ? snapshot.data()
    : null;
}

async function saveRoom(code, data) {
  await setDoc(
    doc(db, "rooms", code),
    data,
    {
      merge: true
    }
  );
}

/* =========================
   IMAGE COMPRESSION
========================= */

function compressImage(file) {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onerror = () =>
        reject(
          new Error(
            "Could not read image"
          )
        );

      reader.onload = () => {
        const image = new Image();

        image.onerror = () =>
          reject(
            new Error(
              "Could not load image"
            )
          );

        image.onload = () => {
          const size = 160;

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width = size;
          canvas.height = size;

          const context =
            canvas.getContext("2d");

          const side = Math.min(
            image.width,
            image.height
          );

          const sx =
            (image.width - side) /
            2;

          const sy =
            (image.height - side) /
            2;

          context.drawImage(
            image,
            sx,
            sy,
            side,
            side,
            0,
            0,
            size,
            size
          );

          resolve(
            canvas.toDataURL(
              "image/jpeg",
              0.72
            )
          );
        };

        image.src = reader.result;
      };

      reader.readAsDataURL(file);
    }
  );
}

/* =========================
   PROFILE FORM
========================= */

function ProfileForm({
  name,
  setName,
  avatar,
  photoError,
  onPick,
  onSave,
  onCancel,
  isNew
}) {
  return (
    <div className="profile-form">
      <div className="profile-inner">
        <h1>
          {isNew
            ? "Set up your profile"
            : "Edit profile"}
        </h1>

        <p className="profile-sub">
          Choose a photo and name so
          people know it's you.
        </p>

        <button
          className="avatar-picker"
          onClick={onPick}
          type="button"
        >
          {avatar ? (
            <img
              src={avatar}
              alt=""
            />
          ) : (
            <div
              className="avatar-placeholder"
              style={{
                background:
                  colorForName(name)
              }}
            >
              {initialsFor(name) ===
              "?" ? (
                <Camera size={22} />
              ) : (
                initialsFor(name)
              )}
            </div>
          )}

          <span className="camera-badge">
            <Camera size={13} />
          </span>
        </button>

        {photoError && (
          <p className="photo-error">
            Couldn't load that photo.
          </p>
        )}

        <input
          className="name-input"
          value={name}
          onChange={(e) =>
            setName(e.target.value)
          }
          placeholder="Your name"
          maxLength={30}
        />

        <button
          className={
            "primary-btn" +
            (name.trim()
              ? " active"
              : "")
          }
          disabled={!name.trim()}
          onClick={onSave}
          type="button"
        >
          {isNew
            ? "Continue"
            : "Save"}
        </button>

        {onCancel && (
          <button
            className="text-btn"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}

        <button
          className="signout-btn"
          onClick={() =>
            signOut(auth)
          }
          type="button"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/* =========================
   AUTH
========================= */

function AuthForm() {
  const [mode, setMode] =
    useState("signin");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [name, setName] =
    useState("");

  const [error, setError] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  async function submit(event) {
    event.preventDefault();

    setError("");
    setBusy(true);

    try {
      if (mode === "signup") {
        if (!name.trim()) {
          throw new Error(
            "Enter your name."
          );
        }

        const credential =
          await createUserWithEmailAndPassword(
            auth,
            email.trim(),
            password
          );

        await saveProfileCloud(
          credential.user.uid,
          {
            id: credential.user.uid,
            name: name.trim(),
            email:
              credential.user
                .email || "",
            avatar: null
          }
        );
      } else {
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
      }
    } catch (err) {
      const messages = {
        "auth/invalid-credential":
          "Email or password is incorrect.",

        "auth/email-already-in-use":
          "That email already has an account.",

        "auth/weak-password":
          "Use a stronger password.",

        "auth/invalid-email":
          "Enter a valid email address.",

        "auth/too-many-requests":
          "Too many attempts. Try again later."
      };

      setError(
        messages[err.code] ||
          err.message ||
          "Something went wrong."
      );
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setError("");
    setBusy(true);

    try {
      await signInWithPopup(
        auth,
        googleProvider
      );
    } catch (err) {
      if (
        err.code !==
        "auth/popup-closed-by-user"
      ) {
        setError(
          err.message ||
            "Google sign-in failed."
        );
      }

      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          X
        </div>

        <h1>
          Welcome to XORO
        </h1>

        <p className="auth-sub">
          Create your account and
          connect with friends.
        </p>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <input
              className="auth-input"
              value={name}
              onChange={(e) =>
                setName(
                  e.target.value
                )
              }
              placeholder="Your name"
              maxLength={30}
            />
          )}

          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(
                e.target.value
              )
            }
            placeholder="Email address"
          />

          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(
                e.target.value
              )
            }
            placeholder="Password"
          />

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <button
            className="auth-primary"
            disabled={busy}
            type="submit"
          >
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <div className="auth-or">
          <span />
          or
          <span />
        </div>

        <button
          className="auth-google"
          onClick={googleSignIn}
          disabled={busy}
          type="button"
        >
          Continue with Google
        </button>

        <button
          className="auth-switch"
          onClick={() => {
            setMode(
              mode === "signup"
                ? "signin"
                : "signup"
            );

            setError("");
          }}
          type="button"
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "New to XORO? Create an account"}
        </button>
      </div>
    </div>
  );
}

/* =========================
   MAIN APP
========================= */

function App() {
  const [loading, setLoading] =
    useState(true);

  const [user, setUser] =
    useState(null);

  const [profile, setProfile] =
    useState(null);

  const [
    showProfileForm,
    setShowProfileForm
  ] = useState(false);

  const [formName, setFormName] =
    useState("");

  const [
    formAvatar,
    setFormAvatar
  ] = useState(null);

  const [
    joinedRooms,
    setJoinedRooms
  ] = useState([]);

  const [
    roomPreviews,
    setRoomPreviews
  ] = useState({});

  const [activeCode, setActiveCode] =
    useState(null);

  const [roomState, setRoomState] =
    useState(null);

  const [query, setQuery] =
    useState("");

  const [
    showNewChat,
    setShowNewChat
  ] = useState(false);

  const [
    joinCodeInput,
    setJoinCodeInput
  ] = useState("");

  const [draft, setDraft] =
    useState("");

  const [
    copyFeedback,
    setCopyFeedback
  ] = useState(false);

  const [
    sendError,
    setSendError
  ] = useState(false);

  const [
    photoError,
    setPhotoError
  ] = useState(false);

  const [
    typingUsers,
    setTypingUsers
  ] = useState([]);

  const fileInputRef =
    useRef(null);

  const scrollRef =
    useRef(null);

  const typingTimer =
    useRef(null);

  const myId =
    profile?.id || null;

  /* =========================
     AUTH STATE
  ========================= */

  useEffect(() => {
    let alive = true;

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (currentUser) => {
          if (!alive) return;

          setUser(currentUser);

          if (!currentUser) {
            setProfile(null);
            setJoinedRooms([]);
            setLoading(false);
            return;
          }

          try {
            let currentProfile =
              await getProfile(
                currentUser.uid
              );

            if (!currentProfile) {
              currentProfile = {
                id: currentUser.uid,
                name:
                  currentUser.displayName ||
                  "",
                email:
                  currentUser.email ||
                  "",
                avatar:
                  currentUser.photoURL ||
                  null
              };

              await saveProfileCloud(
                currentUser.uid,
                currentProfile
              );
            }

            setProfile(
              currentProfile
            );

            const rooms =
              Array.isArray(
                currentProfile.joinedRooms
              )
                ? currentProfile.joinedRooms
                : [];

            setJoinedRooms(rooms);

            if (
              !currentProfile.name
            ) {
              setFormName("");
              setFormAvatar(
                currentProfile.avatar ||
                  null
              );

              setShowProfileForm(
                true
              );
            }
          } catch (error) {
            console.error(
              "Profile error:",
              error
            );
          }

          setLoading(false);
        }
      );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  /* =========================
     ROOM PREVIEWS
  ========================= */

  const refreshPreviews =
    useCallback(
      async (rooms) => {
        if (!rooms?.length)
          return;

        const results =
          await Promise.all(
            rooms.map(
              async (room) => [
                room.code,
                (await getRoom(
                  room.code
                )) || {
                  participants: {},
                  messages: []
                }
              ]
            )
          );

        setRoomPreviews(
          (previous) => ({
            ...previous,
            ...Object.fromEntries(
              results
            )
          })
        );
      },
      []
    );

  useEffect(() => {
    if (
      !loading &&
      !activeCode &&
      joinedRooms.length
    ) {
      refreshPreviews(
        joinedRooms
      );
    }
  }, [
    loading,
    activeCode,
    joinedRooms,
    refreshPreviews
  ]);

  /* =========================
     ACTIVE ROOM LISTENER
  ========================= */

  useEffect(() => {
    if (!activeCode) {
      setTypingUsers([]);
      return undefined;
    }

    const unsubscribeRoom =
      onSnapshot(
        doc(
          db,
          "rooms",
          activeCode
        ),
        (snapshot) => {
          setRoomState(
            snapshot.exists()
              ? snapshot.data()
              : {
                  participants: {},
                  messages: []
                }
          );
        }
      );

    const unsubscribeTyping =
      onSnapshot(
        doc(
          db,
          "rooms",
          activeCode,
          "typing",
          "state"
        ),
        (snapshot) => {
          const data =
            snapshot.exists()
              ? snapshot.data()
              : {};

          const now =
            Date.now();

          const active =
            Object.entries(data)
              .filter(
                ([id, value]) =>
                  id !== myId &&
                  value?.name &&
                  value?.until &&
                  value.until >
                    now
              )
              .map(
                ([, value]) =>
                  value.name
              );

          setTypingUsers(
            active
          );
        }
      );

    return () => {
      unsubscribeRoom();
      unsubscribeTyping();
    };
  }, [
    activeCode,
    myId
  ]);

  /* =========================
     SCROLL
  ========================= */

  useEffect(() => {
    if (
      activeCode &&
      scrollRef.current
    ) {
      scrollRef.current.scrollTop =
        scrollRef.current.scrollHeight;
    }
  }, [
    activeCode,
    roomState
  ]);

  /* =========================
     PROFILE
  ========================= */

  async function saveProfile() {
    if (!user) return;

    const name =
      formName.trim();

    if (!name) return;

    const data = {
      id: user.uid,
      name,
      email:
        user.email || "",
      avatar:
        formAvatar || null
    };

    await saveProfileCloud(
      user.uid,
      data
    );

    setProfile(
      (previous) => ({
        ...(previous || {}),
        ...data
      })
    );

    setShowProfileForm(
      false
    );
  }

  function openProfileForm() {
    setFormName(
      profile?.name || ""
    );

    setFormAvatar(
      profile?.avatar || null
    );

    setPhotoError(false);
    setShowProfileForm(true);
  }

  async function handlePickPhoto(
    event
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    setPhotoError(false);

    try {
      const image =
        await compressImage(file);

      setFormAvatar(image);
    } catch {
      setPhotoError(true);
    }
  }

  /* =========================
     JOINED ROOMS
  ========================= */

  async function persistJoinedRooms(
    rooms
  ) {
    setJoinedRooms(rooms);

    if (user) {
      await saveProfileCloud(
        user.uid,
        {
          joinedRooms: rooms
        }
      );
    }
  }

  /* =========================
     CREATE CHAT
  ========================= */

  async function createChat() {
    if (!profile || !user)
      return;

    let code =
      generateCode();

    while (
      await getRoom(code)
    ) {
      code =
        generateCode();
    }

    const room = {
      ownerId: user.uid,

      participants: {
        [user.uid]: {
          name: profile.name,
          avatar:
            profile.avatar ||
            null
        }
      },

      messages: [],

      createdAt:
        serverTimestamp()
    };

    await saveRoom(
      code,
      room
    );

    const now = Date.now();

    const nextRooms = [
      ...joinedRooms,
      {
        code,
        addedAt: now,
        lastOpenedAt: now
      }
    ];

    await persistJoinedRooms(
      nextRooms
    );

    setRoomPreviews(
      (previous) => ({
        ...previous,
        [code]: room
      })
    );

    setShowNewChat(false);
    setRoomState(room);
    setActiveCode(code);
  }

  /* =========================
     JOIN CHAT
  ========================= */

  async function joinChat(rawCode) {
    if (!profile || !user)
      return;

    const code =
      rawCode
        .trim()
        .toUpperCase();

    if (!code) return;

    let room =
      await getRoom(code);

    if (!room) {
      setSendError(true);
      return;
    }

    const participants = {
      ...(room.participants ||
        {}),

      [user.uid]: {
        name: profile.name,
        avatar:
          profile.avatar ||
          null
      }
    };

    room = {
      ...room,
      participants
    };

    await saveRoom(
      code,
      {
        participants
      }
    );

    const exists =
      joinedRooms.some(
        (room) =>
          room.code === code
      );

    const now = Date.now();

    const nextRooms =
      exists
        ? joinedRooms.map(
            (room) =>
              room.code === code
                ? {
                    ...room,
                    lastOpenedAt:
                      now
                  }
                : room
          )
        : [
            ...joinedRooms,
            {
              code,
              addedAt: now,
              lastOpenedAt: now
            }
          ];

    await persistJoinedRooms(
      nextRooms
    );

    setRoomPreviews(
      (previous) => ({
        ...previous,
        [code]: room
      })
    );

    setJoinCodeInput("");
    setShowNewChat(false);
    setRoomState(room);
    setActiveCode(code);
    setSendError(false);
  }

  /* =========================
     OPEN / CLOSE ROOM
  ========================= */

  function openRoom(code) {
    const nextRooms =
      joinedRooms.map(
        (room) =>
          room.code === code
            ? {
                ...room,
                lastOpenedAt:
                  Date.now()
              }
            : room
      );

    persistJoinedRooms(
      nextRooms
    );

    setRoomState(
      roomPreviews[code] || {
        participants: {},
        messages: []
      }
    );

    setActiveCode(code);
  }

  function closeRoom() {
    if (typingTimer.current) {
      clearTimeout(
        typingTimer.current
      );
    }

    updateTyping(false);

    setActiveCode(null);
    setDraft("");
    setRoomState(null);

    refreshPreviews(
      joinedRooms
    );
  }

  /* =========================
     TYPING
  ========================= */

  async function updateTyping(
    typing
  ) {
    if (
      !activeCode ||
      !user ||
      !profile
    ) {
      return;
    }

    const reference =
      doc(
        db,
        "rooms",
        activeCode,
        "typing",
        "state"
      );

    try {
      if (typing) {
        await setDoc(
          reference,
          {
            [user.uid]: {
              name: profile.name,
              until:
                Date.now() +
                3500
            }
          },
          {
            merge: true
          }
        );

        if (
          typingTimer.current
        ) {
          clearTimeout(
            typingTimer.current
          );
        }

        typingTimer.current =
          setTimeout(
            () =>
              updateTyping(
                false
              ),
            3000
          );
      } else {
        await setDoc(
          reference,
          {
            [user.uid]: null
          },
          {
            merge: true
          }
        );
      }
    } catch {
      /* Non-critical */
    }
  }

  /* =========================
     SEND MESSAGE
  ========================= */

  async function sendMessage() {
    const text =
      draft.trim();

    if (
      !text ||
      !activeCode ||
      !user ||
      !profile
    ) {
      return;
    }

    setDraft("");
    setSendError(false);

    await updateTyping(false);

    const message = {
      id: uid(),
      senderId: user.uid,
      text,
      ts: Date.now()
    };

    try {
      await saveRoom(
        activeCode,
        {
          participants: {
            [user.uid]: {
              name:
                profile.name,
              avatar:
                profile.avatar ||
                null
            }
          },

          messages:
            arrayUnion(message)
        }
      );
    } catch {
      setSendError(true);
      setDraft(text);
    }
  }

  /* =========================
     COPY ROOM CODE
  ========================= */

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(
        code
      );

      setCopyFeedback(true);

      setTimeout(
        () =>
          setCopyFeedback(false),
        1500
      );
    } catch {
      /* Code remains visible */
    }
  }

  /* =========================
     CHAT LIST
  ========================= */

  const listItems =
    joinedRooms
      .map((joined) => {
        const room =
          roomPreviews[joined.code] ||
          {
            participants: {},
            messages: []
          };

        const messages =
          Array.isArray(
            room.messages
          )
            ? room.messages
            : [];

        const last =
          messages[
            messages.length - 1
          ];

        const others =
          Object.entries(
            room.participants ||
              {}
          ).filter(
            ([id]) =>
              id !== myId
          );

        const other =
          others[0]?.[1] ||
          null;

        const unread =
          !!last &&
          last.senderId !==
            myId &&
          last.ts >
            (joined.lastOpenedAt ||
              0);

        return {
          code: joined.code,

          title:
            roomTitle(
              room.participants,
              myId
            ),

          other,

          lastMessage:
            last
              ? last.text
              : "No messages yet · code " +
                joined.code,

          lastSender:
            last
              ? last.senderId
              : null,

          ts:
            last
              ? last.ts
              : joined.addedAt,

          unread
        };
      })
      .filter((item) =>
        item.title
          .toLowerCase()
          .includes(
            query
              .trim()
              .toLowerCase()
          )
      )
      .sort(
        (a, b) =>
          b.ts - a.ts
      );

  /* =========================
     ACTIVE CHAT
  ========================= */

  const activeOthers =
    roomState
      ? Object.entries(
          roomState.participants ||
            {}
        ).filter(
          ([id]) =>
            id !== myId
        )
      : [];

  const activeOther =
    activeOthers[0]?.[1] ||
    null;

  const activeTitle =
    roomState
      ? roomTitle(
          roomState.participants,
          myId
        )
      : "";

  /* =========================
     RENDER MESSAGES
  ========================= */

  function renderMessages() {
    if (!roomState) {
      return null;
    }

    const messages =
      Array.isArray(
        roomState.messages
      )
        ? roomState.messages
        : [];

    const elements = [];
    let previousDay = null;

    messages.forEach(
      (message, index) => {
        const day =
          new Date(
            message.ts
          ).toDateString();

        if (
          day !== previousDay
        ) {
          elements.push(
            <div
              className="day-divider"
              key={
                "day-" +
                message.id
              }
            >
              {formatDayDivider(
                message.ts
              )}
            </div>
          );

          previousDay = day;
        }

        const isMe =
          message.senderId ===
          myId;

        const sender =
          roomState
            .participants?.[
            message.senderId
          ] || {
            name: "Someone",
            avatar: null
          };

        const next =
          messages[index + 1];

        const lastInGroup =
          !next ||
          next.senderId !==
            message.senderId ||
          next.ts -
              message.ts >
            5 * MIN;

        elements.push(
          <div
            className={
              "bubble-row " +
              (isMe
                ? "me"
                : "them")
            }
            key={message.id}
          >
            {!isMe && (
              <div
                className="avatar tiny"
                style={{
                  visibility:
                    lastInGroup
                      ? "visible"
                      : "hidden",

                  background:
                    sender.avatar
                      ? "transparent"
                      : colorForName(
                          sender.name
                        )
                }}
              >
                {sender.avatar ? (
                  <img
                    src={
                      sender.avatar
                    }
                    alt=""
                  />
                ) : (
                  initialsFor(
                    sender.name
                  )
                )}
              </div>
            )}

            <div
              className={
                "bubble " +
                (isMe
                  ? "me"
                  : "them")
              }
            >
              {message.text}
            </div>
          </div>
        );
      }
    );

    return elements;
  }

  /* =========================
     UI
  ========================= */

  return (
    <div className="app-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

        :root {
          --cyan: #00B8D9;
          --cyan-dark: #008FA8;
          --cyan-light: #E8FAFD;
          --cyan-soft: #F1FCFE;
          --text: #14141A;
          --muted: #8A8A93;
          --border: #E1EEF0;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          width: 100%;
          height: 100%;
          margin: 0;
        }

        body {
          background: #F3FCFD;
        }

        button,
        input {
          font-family: inherit;
        }

        .app-shell {
          position: relative;
          width: 100%;
          max-width: 480px;
          height: 100vh;
          margin: 0 auto;
          overflow: hidden;
          background: white;
          color: var(--text);
          font-family: Inter, sans-serif;
          box-shadow:
            0 0 40px rgba(0,0,0,.06);
        }

        .panel {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          background: white;
          transition:
            transform 320ms
            cubic-bezier(.22,.61,.36,1);
        }

        .loading-screen {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--muted);
        }

        .list-header {
          padding: 20px 20px 4px;
        }

        .list-header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .list-header h1 {
          margin: 0;
          font-family: Outfit, sans-serif;
          font-size: 28px;
          font-weight: 700;
        }

        .my-avatar-btn {
          width: 36px;
          height: 36px;
          padding: 0;
          border: 0;
          border-radius: 50%;
          overflow: hidden;
          background: none;
          cursor: pointer;
        }

        .my-avatar-btn img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 14px 16px 6px;
          padding: 9px 12px;
          border: 1px solid #E1F0F2;
          border-radius: 12px;
          background: #F0F8FA;
        }

        .search-bar svg {
          color: var(--cyan-dark);
          flex-shrink: 0;
        }

        .search-bar input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          font-size: 14px;
        }

        .search-bar button {
          display: flex;
          padding: 0;
          border: 0;
          background: none;
          color: #999;
        }

        .new-chat-toggle {
          width: calc(100% - 32px);
          margin: 10px 16px 0;
          padding: 9px 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 1px dashed #B8E4EA;
          border-radius: 12px;
          background: white;
          color: var(--cyan-dark);
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
        }

        .new-chat-toggle:hover {
          background: var(--cyan-soft);
        }

        .new-chat-panel {
          margin: 10px 16px 4px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          border: 1px solid #E0F1F3;
          border-radius: 14px;
          background: #F3FBFC;
        }

        .new-chat-create {
          padding: 10px;
          border: 0;
          border-radius: 10px;
          background:
            linear-gradient(
              135deg,
              #00C7E8,
              #00A9C7
            );
          color: white;
          font-weight: 600;
          cursor: pointer;
        }

        .new-chat-join {
          display: flex;
          gap: 8px;
        }

        .new-chat-join input {
          flex: 1;
          min-width: 0;
          padding: 9px 12px;
          border: 1px solid #D8EAED;
          border-radius: 10px;
          outline: none;
          text-transform: uppercase;
          letter-spacing: .06em;
        }

        .new-chat-join input:focus {
          border-color: var(--cyan);
        }

        .new-chat-join button {
          padding: 0 16px;
          border: 0;
          border-radius: 10px;
          background: #14141A;
          color: white;
          font-weight: 600;
          cursor: pointer;
        }

        .new-chat-join button:disabled {
          background: #D8D8DE;
        }

        .conv-list {
          flex: 1;
          overflow-y: auto;
          padding: 6px 8px 12px;
        }

        .conv-row {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 9px 8px;
          border: 0;
          border-radius: 14px;
          background: none;
          text-align: left;
          cursor: pointer;
        }

        .conv-row:hover {
          background: #F5FBFC;
        }

        .avatar-wrap {
          width: 52px;
          height: 52px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .avatar-wrap.unread {
          padding: 2.5px;
          background:
            linear-gradient(
              135deg,
              #00C7E8,
              #008FA8
            );
        }

        .avatar {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 50%;
          color: white;
          font-family: Outfit, sans-serif;
          font-weight: 600;
        }

        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }

        .avatar.small {
          width: 34px;
          height: 34px;
          flex-shrink: 0;
          font-size: 13px;
        }

        .avatar.tiny {
          width: 22px;
          height: 22px;
          margin-right: 6px;
          flex-shrink: 0;
          font-size: 9px;
        }

        .conv-meta {
          flex: 1;
          min-width: 0;
        }

        .conv-top,
        .conv-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .conv-bottom {
          margin-top: 2px;
        }

        .conv-name {
          font-size: 15px;
          font-weight: 600;
        }

        .conv-time {
          flex-shrink: 0;
          color: #999;
          font-size: 12px;
        }

        .conv-preview {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #8A8A93;
          font-size: 13.5px;
        }

        .conv-preview.unread {
          color: #14141A;
          font-weight: 500;
        }

        .dot {
          width: 8px;
          height: 8px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--cyan);
        }

        .empty {
          padding: 48px 24px;
          text-align: center;
          color: #999;
          font-size: 14px;
          line-height: 1.5;
        }

        .conv-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px;
          border-bottom: 1px solid #E6EFF1;
        }

        .conv-header > button:first-child {
          display: flex;
          padding: 4px;
          border: 0;
          border-radius: 8px;
          background: none;
          cursor: pointer;
        }

        .conv-header-text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .conv-header-name {
          font-family: Outfit, sans-serif;
          font-size: 15px;
          font-weight: 600;
        }

        .code-chip {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0;
          margin-top: 1px;
          border: 0;
          background: none;
          color: #999;
          font-size: 11.5px;
          cursor: pointer;
          letter-spacing: .04em;
        }

        .code-chip:hover {
          color: var(--cyan-dark);
        }

        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px 14px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          background:
            linear-gradient(
              165deg,
              #E9FBFE 0%,
              #E5F7FA 45%,
              #EAF7FB 100%
            );
        }

        .day-divider {
          margin: 14px 0 10px;
          text-align: center;
          color: #7C9AA0;
          font-size: 11.5px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .bubble-row {
          max-width: 78%;
          display: flex;
          align-items: flex-end;
        }

        .bubble-row.me {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .bubble-row.them {
          align-self: flex-start;
        }

        .bubble {
          padding: 9px 13px;
          border-radius: 18px;
          font-size: 14.5px;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .bubble.me {
          border-bottom-right-radius: 5px;
          background: var(--cyan);
          color: white;
        }

        .bubble.them {
          border-bottom-left-radius: 5px;
          background: white;
          color: #14141A;
          box-shadow:
            0 1px 2px rgba(20,20,26,.06);
        }

        .waiting-banner {
          max-width: 90%;
          margin: 10px auto;
          padding: 10px 14px;
          border: 1px solid white;
          border-radius: 12px;
          background: rgba(255,255,255,.8);
          color: #52747B;
          font-size: 12.5px;
          text-align: center;
        }

        .typing-signal {
          align-self: flex-start;
          margin: 0 14px 6px;
          padding: 5px 10px;
          border-radius: 10px 10px 10px 3px;
          background: #E9FAFD;
          color: var(--cyan-dark);
          font-size: 11.5px;
          font-weight: 600;
        }

        .composer {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-top: 1px solid #E6EFF1;
          background: white;
        }

        .composer input {
          flex: 1;
          min-width: 0;
          padding: 10px 16px;
          border: 1px solid #DDEBED;
          border-radius: 20px;
          outline: none;
          background: #F5FAFB;
          font-size: 14.5px;
        }

        .composer input:focus {
          border-color: var(--cyan);
        }

        .send-btn {
          width: 36px;
          height: 36px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 50%;
          background: #DDE4E6;
          color: white;
          cursor: not-allowed;
        }

        .send-btn.active {
          background: var(--cyan);
          cursor: pointer;
        }

        .send-error {
          padding: 6px 0;
          background: white;
          color: #D64545;
          font-size: 12px;
          text-align: center;
        }

        .profile-form {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: white;
        }

        .profile-inner {
          width: 100%;
          max-width: 320px;
          text-align: center;
        }

        .profile-inner h1 {
          margin: 0 0 6px;
          font-family: Outfit, sans-serif;
          font-size: 22px;
        }

        .profile-sub {
          margin: 0 0 18px;
          color: #8A8A93;
          font-size: 13.5px;
        }

        .avatar-picker {
          position: relative;
          width: 96px;
          height: 96px;
          margin: 0 auto 20px;
          padding: 0;
          border: 0;
          border-radius: 50%;
          background: none;
          cursor: pointer;
        }

        .avatar-picker > img,
        .avatar-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .avatar-picker > img {
          object-fit: cover;
        }

        .avatar-placeholder {
          color: white;
          font-family: Outfit, sans-serif;
          font-size: 28px;
          font-weight: 600;
        }

        .camera-badge {
          position: absolute;
          right: 0;
          bottom: 0;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2.5px solid white;
          border-radius: 50%;
          background: #14141A;
          color: white;
        }

        .photo-error {
          margin: -10px 0 14px;
          color: #D64545;
          font-size: 12px;
        }

        .name-input {
          width: 100%;
          margin-bottom: 14px;
          padding: 12px 14px;
          border: 1px solid #DDEBED;
          border-radius: 12px;
          outline: none;
          background: #F5FAFB;
          font-size: 15px;
          text-align: center;
        }

        .name-input:focus {
          border-color: var(--cyan);
        }

        .primary-btn {
          width: 100%;
          margin-bottom: 10px;
          padding: 12px;
          border: 0;
          border-radius: 12px;
          background: #DDE4E6;
          color: white;
          font-size: 14.5px;
          font-weight: 600;
          cursor: not-allowed;
        }

        .primary-btn.active {
          background: var(--cyan);
          cursor: pointer;
        }

        .text-btn,
        .signout-btn {
          border: 0;
          background: none;
          cursor: pointer;
        }

        .text-btn {
          padding: 6px;
          color: #999;
          font-size: 13px;
        }

        .signout-btn {
          display: block;
          margin: 8px auto 0;
          color: #D64545;
          font-size: 13px;
        }

        .auth-screen {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background:
            linear-gradient(
              165deg,
              #E8FBFE,
              #E6F8FB 45%,
              #F1FCFD
            );
        }

        .auth-card {
          width: 100%;
          max-width: 340px;
          padding: 28px 22px;
          border-radius: 24px;
          background: white;
          box-shadow:
            0 12px 40px
            rgba(0,80,95,.12);
          text-align: center;
        }

        .auth-logo {
          width: 58px;
          height: 58px;
          margin: 0 auto 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 18px;
          background:
            linear-gradient(
              135deg,
              #00C7E8,
              #008FA8
            );
          color: white;
          font-size: 28px;
          font-weight: 800;
        }

        .auth-card h1 {
          margin: 0 0 6px;
          font-size: 24px;
        }

        .auth-sub {
          margin: 0 0 18px;
          color: #8A8A93;
          font-size: 13px;
        }

        .auth-input {
          width: 100%;
          margin-bottom: 10px;
          padding: 12px 14px;
          border: 1px solid #DDEBED;
          border-radius: 12px;
          outline: none;
          background: #F5FAFB;
          font-size: 14px;
        }

        .auth-input:focus {
          border-color: var(--cyan);
        }

        .auth-primary,
        .auth-google {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .auth-primary {
          border: 0;
          background:
            linear-gradient(
              135deg,
              #00C7E8,
              #008FA8
            );
          color: white;
        }

        .auth-google {
          border: 1px solid #DDEBED;
          background: white;
        }

        .auth-or {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 14px 0;
          color: #AAA;
          font-size: 12px;
        }

        .auth-or span {
          flex: 1;
          height: 1px;
          background: #EEE;
        }

        .auth-switch {
          margin-top: 14px;
          border: 0;
          background: none;
          color: var(--cyan-dark);
          font-size: 13px;
          cursor: pointer;
        }

        .auth-error {
          margin: 2px 0 10px;
          color: #D64545;
          font-size: 12px;
        }

        @media (prefers-reduced-motion: reduce) {
          .panel {
            transition: none;
          }
        }
      `}</style>

      {loading ? (
        <div className="loading-screen">
          Loading…
        </div>
      ) : !user ? (
        <AuthForm />
      ) : showProfileForm ? (
        <ProfileForm
          name={formName}
          setName={setFormName}
          avatar={formAvatar}
          photoError={photoError}
          onPick={() =>
            fileInputRef.current?.click()
          }
          onSave={saveProfile}
          onCancel={
            profile
              ? () =>
                  setShowProfileForm(
                    false
                  )
              : null
          }
          isNew={!profile?.name}
        />
      ) : (
        <>
          <div
            className="panel"
            style={{
              transform: activeCode
                ? "translateX(-100%)"
                : "translateX(0)"
            }}
          >
            <div className="list-header">
              <div className="list-header-top">
                <h1>Chats</h1>

                <button
                  className="my-avatar-btn"
                  onClick={
                    openProfileForm
                  }
                  type="button"
                >
                  {profile?.avatar ? (
                    <img
                      src={profile.avatar}
                      alt=""
                    />
                  ) : (
                    <div
                      className="avatar-placeholder"
                      style={{
                        background:
                          colorForName(
                            profile?.name ||
                              ""
                          )
                      }}
                    >
                      {initialsFor(
                        profile?.name ||
                          ""
                      )}
                    </div>
                  )}
                </button>
              </div>
            </div>

            <div className="search-bar">
              <Search size={16} />

              <input
                value={query}
                onChange={(e) =>
                  setQuery(
                    e.target.value
                  )
                }
                placeholder="Search"
              />

              {query && (
                <button
                  onClick={() =>
                    setQuery("")
                  }
                  type="button"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              className="new-chat-toggle"
              onClick={() =>
                setShowNewChat(
                  (value) => !value
                )
              }
              type="button"
            >
              <Plus size={16} />
              New chat
            </button>

            {showNewChat && (
              <div className="new-chat-panel">
                <button
                  className="new-chat-create"
                  onClick={
                    createChat
                  }
                  type="button"
                >
                  Create a new chat
                </button>

                <div className="new-chat-join">
                  <input
                    value={
                      joinCodeInput
                    }
                    onChange={(e) =>
                      setJoinCodeInput(
                        e.target.value.toUpperCase()
                      )
                    }
                    onKeyDown={(e) => {
                      if (
                        e.key ===
                        "Enter"
                      ) {
                        joinChat(
                          joinCodeInput
                        );
                      }
                    }}
                    placeholder="Enter a code"
                    maxLength={8}
                  />

                  <button
                    onClick={() =>
                      joinChat(
                        joinCodeInput
                      )
                    }
                    disabled={
                      !joinCodeInput.trim()
                    }
                    type="button"
                  >
                    Join
                  </button>
                </div>
              </div>
            )}

            <div className="conv-list">
              {listItems.length ===
              0 ? (
                <div className="empty">
                  {joinedRooms.length ===
                  0
                    ? "No chats yet. Tap New chat to start one, then share the code with a friend."
                    : `No results for "${query}"`}
                </div>
              ) : (
                listItems.map(
                  (chat) => (
                    <button
                      className="conv-row"
                      key={chat.code}
                      onClick={() =>
                        openRoom(
                          chat.code
                        )
                      }
                      type="button"
                    >
                      <div
                        className={
                          "avatar-wrap" +
                          (chat.unread
                            ? " unread"
                            : "")
                        }
                      >
                        {chat.other
                          ?.avatar ? (
                          <img
                            className="avatar"
                            src={
                              chat.other
                                .avatar
                            }
                            alt=""
                          />
                        ) : (
                          <div
                            className="avatar"
                            style={{
                              background:
                                colorForName(
                                  chat.other
                                    ? chat
                                        .other
                                        .name
                                    : chat.title
                                )
                            }}
                          >
                            {chat.other
                              ? initialsFor(
                                  chat.other
                                    .name
                                )
                              : "⋯"}
                          </div>
                        )}
                      </div>

                      <div className="conv-meta">
                        <div className="conv-top">
                          <span className="conv-name">
                            {chat.title}
                          </span>

                          <span className="conv-time">
                            {formatRelative(
                              chat.ts
                            )}
                          </span>
                        </div>

                        <div className="conv-bottom">
                          <span
                            className={
                              "conv-preview" +
                              (chat.unread
                                ? " unread"
                                : "")
                            }
                          >
                            {chat.lastSender ===
                            myId
                              ? "You: "
                              : ""}
                            {
                              chat.lastMessage
                            }
                          </span>

                          {chat.unread && (
                            <span className="dot" />
                          )}
                        </div>
                      </div>
                    </button>
                  )
                )
              )}
            </div>
          </div>

          <div
            className="panel"
            style={{
              transform: activeCode
                ? "translateX(0)"
                : "translateX(100%)"
            }}
          >
            {roomState && (
              <>
                <div className="conv-header">
                  <button
                    onClick={
                      closeRoom
                    }
                    type="button"
                  >
                    <ChevronLeft
                      size={22}
                    />
                  </button>

                  {activeOther?.avatar ? (
                    <img
                      className="avatar small"
                      src={
                        activeOther.avatar
                      }
                      alt=""
                    />
                  ) : (
                    <div
                      className="avatar small"
                      style={{
                        background:
                          colorForName(
                            activeOther
                              ? activeOther.name
                              : activeTitle
                          )
                      }}
                    >
                      {activeOther
                        ? initialsFor(
                            activeOther.name
                          )
                        : "⋯"}
                    </div>
                  )}

                  <div className="conv-header-text">
                    <span className="conv-header-name">
                      {activeTitle}
                    </span>

                    <button
                      className="code-chip"
                      onClick={() =>
                        copyCode(
                          activeCode
                        )
                      }
                      type="button"
                    >
                      {copyFeedback ? (
                        <>
                          <Check
                            size={11}
                          />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy
                            size={11}
                          />
                          {activeCode}
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div
                  className="messages"
                  ref={scrollRef}
                >
                  {renderMessages()}

                  {activeOthers.length ===
                    0 && (
                    <div className="waiting-banner">
                      You're the only one
                      here. Share code{" "}
                      <strong>
                        {activeCode}
                      </strong>{" "}
                      so a friend can join.
                    </div>
                  )}
                </div>

                {sendError && (
                  <div className="send-error">
                    Couldn't send. Check
                    your connection and try
                    again.
                  </div>
                )}

                {typingUsers.length >
                  0 && (
                  <div
                    className="typing-signal"
                    aria-live="polite"
                  >
                    ✦{" "}
                    {typingUsers.length ===
                    1
                      ? typingUsers[0]
                      : typingUsers.length +
                        " friends"}{" "}
                    is writing
                  </div>
                )}

                <div className="composer">
                  <input
                    value={draft}
                    onChange={(e) => {
                      const value =
                        e.target.value;

                      setDraft(value);

                      updateTyping(
                        !!value.trim()
                      );
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key ===
                        "Enter"
                      ) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Message..."
                  />

                  <button
                    className={
                      "send-btn" +
                      (draft.trim()
                        ? " active"
                        : "")
                    }
                    onClick={
                      sendMessage
                    }
                    disabled={
                      !draft.trim()
                    }
                    type="button"
                  >
                    <SendHorizontal
                      size={16}
                    />
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={
          handlePickPhoto
        }
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0
        }}
      />
    </div>
  );
}

createRoot(
  document.getElementById("root")
).render(
  <App />
);
