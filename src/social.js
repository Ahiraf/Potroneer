import { createClient } from "@supabase/supabase-js";

// The social API is deliberately small so the editor can stay useful offline.
// With VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY it becomes a real cloud
// backend; without them it falls back to a local demo account and local feed.
const LOCAL_USER_KEY = "potroneer-social-user";
const LOCAL_TERRARIUMS_KEY = "potroneer-social-terrariums";
const LOCAL_LIKES_KEY = "potroneer-social-likes";
const LOCAL_FAVS_KEY = "potroneer-social-favorites";
const LOCAL_CHALLENGE_KEY = "potroneer-social-challenge";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function localUser() {
  return readJson(LOCAL_USER_KEY, null);
}

function publicRecord(record) {
  return {
    ...record,
    ownerName: record.ownerName || record.owner?.display_name || "Potroneer gardener",
    likesCount: Number(record.likesCount ?? record.likes_count ?? 0),
    liked: !!record.liked,
    favorited: !!record.favorited,
  };
}

function remoteRecord(record) {
  return publicRecord({
    ...record,
    ownerName: record.owner?.display_name || record.ownerName,
    likesCount: record.likes_count,
    data: record.data,
    thumbnail: record.thumbnail,
  });
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createSocialClient() {
  const remote = Boolean(supabaseUrl && supabaseKey);
  const supabase = remote ? createClient(supabaseUrl, supabaseKey) : null;
  let authUser = null;
  let coopChannel = null;

  async function currentUser() {
    if (!remote) return localUser();
    const { data } = await supabase.auth.getUser();
    authUser = data.user ?? null;
    return authUser;
  }

  async function ensureProfile(user, displayName) {
    if (!remote || !user) return;
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        display_name:
          displayName || user.user_metadata?.display_name || user.email?.split("@")[0] || "Gardener",
      },
      { onConflict: "id" },
    );
  }

  async function signUp({ email, password, displayName }) {
    if (!remote) {
      const user = { id: makeId(), email, displayName: displayName || email.split("@")[0], demo: true };
      writeJson(LOCAL_USER_KEY, user);
      return { user, needsVerification: false };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw error;
    authUser = data.user ?? null;
    await ensureProfile(data.user, displayName);
    return { user: data.user, needsVerification: !data.session };
  }

  async function signIn({ email, password }) {
    if (!remote) {
      const user = localUser();
      if (!user || user.email !== email) throw new Error("No demo account exists for that email.");
      return { user };
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    authUser = data.user;
    await ensureProfile(data.user);
    return { user: data.user };
  }

  async function signOut() {
    if (remote) await supabase.auth.signOut();
    else localStorage.removeItem(LOCAL_USER_KEY);
    authUser = null;
  }

  async function saveTerrarium({ title, description, data, thumbnail, isPublic = true, remixOf = null, challengeDay = null }) {
    const user = await currentUser();
    if (!user) throw new Error("Please sign in before saving to the community.");
    const payload = {
      title: title || "Untitled terrarium",
      description: description || "A little world made in Potroneer.",
      data,
      thumbnail: thumbnail || null,
      is_public: isPublic,
      remix_of: remixOf,
      challenge_day: challengeDay,
    };
    if (!remote) {
      const entries = readJson(LOCAL_TERRARIUMS_KEY, []);
      const record = publicRecord({
        id: makeId(),
        owner_id: user.id,
        ownerName: user.displayName,
        created_at: new Date().toISOString(),
        likesCount: 0,
        liked: false,
        favorited: false,
        ...payload,
      });
      entries.unshift(record);
      writeJson(LOCAL_TERRARIUMS_KEY, entries.slice(0, 80));
      return record;
    }
    const { data: record, error } = await supabase
      .from("terrariums")
      .insert({ owner_id: user.id, ...payload })
      .select("*, owner:profiles(display_name)")
      .single();
    if (error) throw error;
    return remoteRecord(record);
  }

  async function listPublic() {
    if (!remote) return readJson(LOCAL_TERRARIUMS_KEY, []).filter((record) => record.is_public).map(publicRecord);
    const { data, error } = await supabase
      .from("terrariums")
      .select("*, owner:profiles(display_name)")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    return (data || []).map(remoteRecord);
  }

  async function listMine() {
    const user = await currentUser();
    if (!user) return [];
    if (!remote) return readJson(LOCAL_TERRARIUMS_KEY, []).filter((record) => record.owner_id === user.id).map(publicRecord);
    const { data, error } = await supabase
      .from("terrariums")
      .select("*, owner:profiles(display_name)")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    return (data || []).map(remoteRecord);
  }

  async function getTerrarium(id) {
    if (!id) return null;
    if (!remote) return readJson(LOCAL_TERRARIUMS_KEY, []).map(publicRecord).find((record) => record.id === id) ?? null;
    const { data, error } = await supabase
      .from("terrariums")
      .select("*, owner:profiles(display_name)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return remoteRecord(data);
  }

  async function toggleLike(record) {
    const user = await currentUser();
    if (!user) throw new Error("Sign in to like terrariums.");
    if (!remote) {
      const likes = readJson(LOCAL_LIKES_KEY, {});
      const list = new Set(likes[record.id] || []);
      if (list.has(user.id)) list.delete(user.id);
      else list.add(user.id);
      likes[record.id] = [...list];
      writeJson(LOCAL_LIKES_KEY, likes);
      record.liked = list.has(user.id);
      record.likesCount = list.size;
      return record;
    }
    const { data: existing } = await supabase
      .from("terrarium_likes")
      .select("terrarium_id")
      .eq("terrarium_id", record.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) await supabase.from("terrarium_likes").delete().eq("terrarium_id", record.id).eq("user_id", user.id);
    else await supabase.from("terrarium_likes").insert({ terrarium_id: record.id, user_id: user.id });
    const fresh = await getTerrarium(record.id);
    return { ...record, ...fresh, liked: !existing };
  }

  async function toggleFavorite(record) {
    const user = await currentUser();
    if (!user) throw new Error("Sign in to save favorites.");
    if (!remote) {
      const favorites = readJson(LOCAL_FAVS_KEY, {});
      const list = new Set(favorites[user.id] || []);
      if (list.has(record.id)) list.delete(record.id);
      else list.add(record.id);
      favorites[user.id] = [...list];
      writeJson(LOCAL_FAVS_KEY, favorites);
      record.favorited = list.has(record.id);
      return record;
    }
    const { data: existing } = await supabase
      .from("terrarium_favorites")
      .select("terrarium_id")
      .eq("terrarium_id", record.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) await supabase.from("terrarium_favorites").delete().eq("terrarium_id", record.id).eq("user_id", user.id);
    else await supabase.from("terrarium_favorites").insert({ terrarium_id: record.id, user_id: user.id });
    return { ...record, favorited: !existing };
  }

  async function submitChallenge(day, terrariumId) {
    const user = await currentUser();
    if (!user || !terrariumId) return;
    if (!remote) {
      const state = readJson(LOCAL_CHALLENGE_KEY, {});
      state[day] = [...new Set([...(state[day] || []), user.id])];
      writeJson(LOCAL_CHALLENGE_KEY, state);
      return;
    }
    await supabase.from("community_submissions").upsert(
      { day, terrarium_id: terrariumId, user_id: user.id },
      { onConflict: "day,user_id" },
    );
  }

  async function challengeParticipants(day) {
    if (!remote) return readJson(LOCAL_CHALLENGE_KEY, {})[day]?.length || 0;
    const { count } = await supabase
      .from("community_submissions")
      .select("user_id", { count: "exact", head: true })
      .eq("day", day);
    return count || 0;
  }

  /** A link that drops someone straight into a shared room. */
  function roomInviteUrl(room) {
    return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`;
  }

  /** The room an invite link is pointing at, if this page was opened from one. */
  function invitedRoom() {
    const room = new URLSearchParams(window.location.search).get("room");
    return room ? room.trim().toUpperCase().slice(0, 12) : null;
  }

  async function shareUrl(record) {
    if (remote && record.id) return `${window.location.origin}${window.location.pathname}?terrarium=${encodeURIComponent(record.id)}`;
    return `${window.location.origin}${window.location.pathname}?share=${encodeBase64Url({ title: record.title, data: record.data })}`;
  }

  async function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("share");
    if (shared) return decodeBase64Url(shared);
    const id = params.get("terrarium");
    if (id) return getTerrarium(id);
    return null;
  }

  // --- co-op ----------------------------------------------------------------
  // Two people, one jar, over a Supabase private channel. "Private" is the
  // important word: the channel is authorized by RLS on realtime.messages
  // against room membership, so knowing a room code is not enough to listen —
  // you have to have been let in. See the co-op section of supabase/schema.sql.
  //
  // There is deliberately no demo co-op. A fake room that silently syncs with
  // nobody is worse than being told the feature needs a project behind it.

  /** Thrown with a stable `code` so the UI can say it in either language. */
  class CoopError extends Error {
    constructor(code, message) {
      super(message || code);
      this.code = code;
    }
  }

  const RPC_ERRORS = {
    ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
    ROOM_FULL: "ROOM_FULL",
    AUTH_REQUIRED: "AUTH_REQUIRED",
    NOT_A_MEMBER: "NOT_A_MEMBER",
  };

  function coopErrorFrom(error) {
    const raw = error?.message || "";
    for (const key of Object.keys(RPC_ERRORS)) {
      if (raw.includes(key)) return new CoopError(key, raw);
    }
    if (/jwt|token|session/i.test(raw)) return new CoopError("SESSION_EXPIRED", raw);
    return new CoopError("UNKNOWN", raw);
  }

  function requireCloud() {
    if (!remote || !supabase) throw new CoopError("NO_SUPABASE");
  }

  async function requireCoopUser() {
    const user = await currentUser();
    if (!user) throw new CoopError("AUTH_REQUIRED");
    return user;
  }

  async function createCoopRoom({ build = {}, game = {} } = {}) {
    requireCloud();
    await requireCoopUser();
    const { data, error } = await supabase.rpc("create_coop_room", {
      p_build: build,
      p_game: game,
    });
    if (error) throw coopErrorFrom(error);
    return Array.isArray(data) ? data[0] : data;
  }

  /**
   * Turn a room code into membership. The check and the insert happen together
   * inside one definer function, so there is no window where the client has
   * been told a room exists but is not yet allowed into it.
   */
  async function joinCoopRoomByCode(code) {
    requireCloud();
    await requireCoopUser();
    const { data, error } = await supabase.rpc("join_coop_room", {
      p_code: String(code || "").trim().toUpperCase(),
    });
    if (error) throw coopErrorFrom(error);
    const room = Array.isArray(data) ? data[0] : data;
    if (!room) throw new CoopError("ROOM_NOT_FOUND");
    return room;
  }

  /** The room as it stands right now — what a late joiner opens into. */
  async function fetchCoopState(roomId) {
    requireCloud();
    const { data, error } = await supabase
      .from("coop_rooms")
      .select("id, code, build, game, revision, updated_at")
      .eq("id", roomId)
      .maybeSingle();
    if (error) throw coopErrorFrom(error);
    return data;
  }

  /**
   * Commit state to the room. Goes through a definer function so the revision
   * bump is atomic — two clients saving at once cannot both read revision 7 and
   * both write revision 8.
   */
  async function saveCoopState(roomId, { build, game, revision }) {
    requireCloud();
    const { data, error } = await supabase.rpc("save_coop_state", {
      p_room_id: roomId,
      p_build: build ?? null,
      p_game: game ?? null,
      p_revision: revision ?? null,
    });
    if (error) throw coopErrorFrom(error);
    return Array.isArray(data) ? data[0] : data;
  }

  /**
   * Open the room's private channel.
   *
   * `onStatus` reports the connection honestly — connecting, connected,
   * reconnecting, disconnected — because "is my friend still there" is the
   * question this feature exists to answer, and a silent dead socket answers it
   * wrongly. supabase-js retries on its own; this only surfaces what it is
   * doing.
   */
  async function openCoopChannel(room, { onSnapshot, onPresence, onStatus } = {}) {
    requireCloud();
    const user = await requireCoopUser();
    await closeCoopChannel();

    // Private channels are authorized from the user's JWT, which Realtime only
    // has if we hand it over.
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new CoopError("SESSION_EXPIRED");
    await supabase.realtime.setAuth(token);

    let opened = false;
    coopChannel = supabase.channel(`coop:${room.code}`, {
      config: {
        private: true,
        presence: { key: user.id },
      },
    });

    coopChannel
      .on("broadcast", { event: "snapshot" }, ({ payload }) => onSnapshot?.(payload))
      .on("presence", { event: "sync" }, () => {
        const state = coopChannel?.presenceState?.() ?? {};
        onPresence?.(
          Object.keys(state).length,
          Object.values(state)
            .flat()
            .map((entry) => entry?.displayName)
            .filter(Boolean),
        );
      });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!opened) reject(new CoopError("TIMEOUT"));
      }, 15000);

      coopChannel.subscribe(async (status, error) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          opened = true;
          onStatus?.("connected");
          await coopChannel.track({
            displayName:
              user.user_metadata?.display_name || user.email?.split("@")[0] || "Gardener",
          });
          resolve({ room });
          return;
        }
        if (status === "CHANNEL_ERROR") {
          // After a successful subscribe this is a dropped connection that the
          // client is already retrying; before one it is authorization saying no.
          onStatus?.(opened ? "reconnecting" : "disconnected");
          if (!opened) {
            clearTimeout(timeout);
            reject(coopErrorFrom(error) ?? new CoopError("UNAUTHORIZED"));
          }
          return;
        }
        if (status === "TIMED_OUT") {
          onStatus?.(opened ? "reconnecting" : "disconnected");
          if (!opened) {
            clearTimeout(timeout);
            reject(new CoopError("TIMEOUT"));
          }
          return;
        }
        if (status === "CLOSED") onStatus?.(opened ? "reconnecting" : "disconnected");
      });
    });
  }

  async function broadcastCoop(payload) {
    if (!coopChannel) return false;
    const result = await coopChannel.send({ type: "broadcast", event: "snapshot", payload });
    return result === "ok";
  }

  async function closeCoopChannel() {
    if (coopChannel && supabase) {
      try {
        await coopChannel.untrack();
      } catch {
        /* already gone — nothing to stop announcing */
      }
      await supabase.removeChannel(coopChannel);
    }
    coopChannel = null;
  }

  async function leaveCoop(roomId) {
    await closeCoopChannel();
    if (remote && supabase && roomId) {
      // Best effort: a failed tidy-up must not keep someone in a room they have
      // already left on screen.
      try {
        await supabase.rpc("leave_coop_room", { p_room_id: roomId });
      } catch {
        /* the membership row outlives the session; harmless */
      }
    }
  }

  return {
    roomInviteUrl,
    invitedRoom,
    createCoopRoom,
    joinCoopRoomByCode,
    fetchCoopState,
    saveCoopState,
    openCoopChannel,
    closeCoopChannel,
    mode: remote ? "cloud" : "demo",
    isCloud: remote,
    currentUser,
    signUp,
    signIn,
    signOut,
    saveTerrarium,
    listPublic,
    listMine,
    getTerrarium,
    toggleLike,
    toggleFavorite,
    submitChallenge,
    challengeParticipants,
    shareUrl,
    loadFromUrl,
    broadcastCoop,
    leaveCoop,
  };
}
