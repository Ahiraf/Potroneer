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

  return {
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
  };
}
