/*
  My Spotify Player

  IMPORTANT:
  Replace CLIENT_ID with your Spotify Developer Client ID.
*/

const CLIENT_ID = "e9a02e5d46434f67b9cd8f7c45083003";

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state"
].join(" ");

const REDIRECT_URI = window.location.origin + window.location.pathname;

let player = null;
let deviceId = null;
let currentTrack = null;
let accessToken = null;

const $ = (id) => document.getElementById(id);


/* =========================
   PKCE
========================= */

function randomString(length = 64) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  return Array.from(array)
    .map(x => chars[x % chars.length])
    .join("");
}

async function sha256(plain) {
  const encoder = new TextEncoder();

  return crypto.subtle.digest(
    "SHA-256",
    encoder.encode(plain)
  );
}

function base64UrlEncode(buffer) {
  return btoa(
    String.fromCharCode(...new Uint8Array(buffer))
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createCodeChallenge(verifier) {
  const hashed = await sha256(verifier);
  return base64UrlEncode(hashed);
}


/* =========================
   LOGIN
========================= */

async function login() {

  if (!CLIENT_ID || CLIENT_ID.includes("VUL_HIER")) {
    alert("Vul eerst je Spotify Client ID in app.js in.");
    return;
  }

  const verifier = randomString();
  const challenge = await createCodeChallenge(verifier);

  localStorage.setItem(
    "spotify_code_verifier",
    verifier
  );

  const state = randomString(32);

  localStorage.setItem(
    "spotify_state",
    state
  );

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  window.location.href =
    "https://accounts.spotify.com/authorize?" +
    params.toString();
}


/* =========================
   CALLBACK
========================= */

async function handleCallback() {

  const params = new URLSearchParams(
    window.location.search
  );

  const code = params.get("code");
  const returnedState = params.get("state");
  const error = params.get("error");

  if (error) {
    alert("Spotify login geannuleerd.");
    return;
  }

  if (!code) return;

  const savedState =
    localStorage.getItem("spotify_state");

  if (!savedState || savedState !== returnedState) {
    alert("Security error: state mismatch.");
    return;
  }

  const verifier =
    localStorage.getItem("spotify_code_verifier");

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier
  });

  const response = await fetch(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error(data);
    alert("Spotify login mislukt.");
    return;
  }

  saveTokens(data);

  localStorage.removeItem("spotify_code_verifier");
  localStorage.removeItem("spotify_state");

  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );
}


/* =========================
   TOKEN
========================= */

function saveTokens(data) {

  accessToken = data.access_token;

  localStorage.setItem(
    "spotify_access_token",
    data.access_token
  );

  if (data.refresh_token) {
    localStorage.setItem(
      "spotify_refresh_token",
      data.refresh_token
    );
  }

  const expiresAt =
    Date.now() + (data.expires_in * 1000);

  localStorage.setItem(
    "spotify_expires_at",
    expiresAt
  );
}

async function refreshToken() {

  const refresh =
    localStorage.getItem(
      "spotify_refresh_token"
    );

  if (!refresh) {
    return false;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: CLIENT_ID
  });

  const response = await fetch(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body
    }
  );

  const data = await response.json();

  if (!response.ok) {

    if (data.error === "invalid_grant") {
      logout();
      return false;
    }

    throw new Error(
      data.error_description ||
      "Token refresh failed"
    );
  }

  saveTokens(data);

  return true;
}

async function getToken() {

  const expiresAt = Number(
    localStorage.getItem(
      "spotify_expires_at"
    )
  );

  if (
    accessToken &&
    Date.now() < expiresAt - 60000
  ) {
    return accessToken;
  }

  accessToken =
    localStorage.getItem(
      "spotify_access_token"
    );

  if (
    accessToken &&
    Date.now() < expiresAt - 60000
  ) {
    return accessToken;
  }

  const refreshed =
    await refreshToken();

  if (refreshed) {
    return accessToken;
  }

  return null;
}


/* =========================
   API
========================= */

async function spotifyFetch(url, options = {}) {

  const token = await getToken();

  if (!token) {
    throw new Error("Niet ingelogd.");
  }

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };

  const response = await fetch(
    url,
    {
      ...options,
      headers
    }
  );

  if (response.status === 401) {

    const refreshed =
      await refreshToken();

    if (!refreshed) {
      throw new Error("Spotify sessie verlopen.");
    }

    const newToken =
      await getToken();

    headers.Authorization =
      `Bearer ${newToken}`;

    return fetch(
      url,
      {
        ...options,
        headers
      }
    );
  }

  return response;
}


/* =========================
   PROFILE
========================= */

async function loadProfile() {

  try {

    const response =
      await spotifyFetch(
        "https://api.spotify.com/v1/me"
      );

    const profile =
      await response.json();

    $("userName").textContent =
      profile.display_name ||
      profile.id;

  } catch (error) {
    console.error(error);
  }
}


/* =========================
   SEARCH
========================= */

async function searchTracks() {

  const query =
    $("searchInput").value.trim();

  if (!query) return;

  $("results").innerHTML =
    `<p style="color:#999">Zoeken...</p>`;

  try {

    const url =
      "https://api.spotify.com/v1/search?" +
      new URLSearchParams({
        q: query,
        type: "track",
        limit: "20"
      });

    const response =
      await spotifyFetch(url);

    const data =
      await response.json();

    displayResults(
      data.tracks?.items || []
    );

  } catch (error) {

    console.error(error);

    $("results").innerHTML =
      `<p>Er ging iets mis bij het zoeken.</p>`;
  }
}

function displayResults(tracks) {

  if (!tracks.length) {
    $("results").innerHTML =
      "<p>Geen resultaten gevonden.</p>";
    return;
  }

  $("results").innerHTML = "";

  tracks.forEach(track => {

    const image =
      track.album.images?.[1]?.url ||
      track.album.images?.[0]?.url ||
      "";

    const artists =
      track.artists
        .map(a => a.name)
        .join(", ");

    const element =
      document.createElement("div");

    element.className = "result";

    element.innerHTML = `
      <img src="${image}" alt="">
      <div class="result-info">
        <strong>${escapeHtml(track.name)}</strong>
        <span>${escapeHtml(artists)}</span>
      </div>
      <button class="play-result">▶</button>
    `;

    element
      .querySelector("button")
      .addEventListener(
        "click",
        () => playTrack(track.uri)
      );

    $("results").appendChild(element);
  });
}


/* =========================
   PLAYER
========================= */

window.onSpotifyWebPlaybackSDKReady =
  async function () {

    const token =
      await getToken();

    if (!token) return;

    player =
      new Spotify.Player({

        name: "My Spotify Web Player",

        getOAuthToken: async callback => {

          const freshToken =
            await getToken();

          callback(freshToken);
        },

        volume: 0.7
      });


    player.addListener(
      "ready",
      ({ device_id }) => {

        deviceId = device_id;

        $("status").textContent =
          "Spotify speler klaar";

        console.log(
          "Spotify device:",
          device_id
        );
      }
    );


    player.addListener(
      "not_ready",
      ({ device_id }) => {

        console.log(
          "Device offline:",
          device_id
        );
      }
    );


    player.addListener(
      "player_state_changed",
      state => {

        if (!state) return;

        const track =
          state.track_window
            .current_track;

        currentTrack = track;

        updateTrack(track);

        $("playBtn").textContent =
          state.paused ? "▶" : "Ⅱ";

        $("progress").value =
          state.duration
            ? (state.position / state.duration) * 100
            : 0;

        $("currentTime").textContent =
          formatTime(state.position);

        $("duration").textContent =
          formatTime(state.duration);
      }
    );


    player.addListener(
      "initialization_error",
      ({ message }) => {
        console.error(message);
      }
    );


    player.addListener(
      "authentication_error",
      ({ message }) => {
        console.error(message);
      }
    );


    player.addListener(
      "account_error",
      ({ message }) => {

        $("status").textContent =
          "Spotify Premium is vereist.";

        console.error(message);
      }
    );


    player.addListener(
      "playback_error",
      ({ message }) => {
        console.error(message);
      }
    );


    await player.connect();
  };


async function playTrack(uri) {

  if (!deviceId) {
    alert(
      "De Spotify speler is nog niet klaar."
    );
    return;
  }

  try {

    const token =
      await getToken();

    const response =
      await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {
          method: "PUT",

          headers: {
            Authorization:
              `Bearer ${token}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            uris: [uri]
          })
        }
      );

    if (!response.ok) {

      const text =
        await response.text();

      console.error(text);
    }

  } catch (error) {
    console.error(error);
  }
}


/* =========================
   CONTROLS
========================= */

$("playBtn").addEventListener(
  "click",
  () => {

    if (!player) return;

    player.togglePlay();
  }
);

$("nextBtn").addEventListener(
  "click",
  () => {

    if (player) {
      player.nextTrack();
    }
  }
);

$("previousBtn").addEventListener(
  "click",
  () => {

    if (player) {
      player.previousTrack();
    }
  }
);

$("volume").addEventListener(
  "input",
  event => {

    if (!player) return;

    player.setVolume(
      Number(event.target.value) / 100
    );
  }
);

$("progress").addEventListener(
  "change",
  event => {

    if (!player) return;

    const state =
      player.getCurrentState();

    if (!state) return;

    const position =
      (Number(event.target.value) / 100) *
      state.duration;

    player.seek(position);
  }
);


/* =========================
   BUTTONS
========================= */

$("loginBtn").addEventListener(
  "click",
  login
);

$("loginBtn2").addEventListener(
  "click",
  login
);

$("logoutBtn").addEventListener(
  "click",
  logout
);

$("searchBtn").addEventListener(
  "click",
  searchTracks
);

$("searchInput").addEventListener(
  "keydown",
  event => {

    if (event.key === "Enter") {
      searchTracks();
    }
  }
);


/* =========================
   UI
========================= */

function updateTrack(track) {

  if (!track) return;

  $("trackName").textContent =
    track.name;

  $("artistName").textContent =
    track.artists
      .map(a => a.name)
      .join(", ");

  $("trackImage").src =
    track.album.images?.[2]?.url ||
    track.album.images?.[0]?.url ||
    "";
}

function formatTime(ms) {

  if (!ms) return "0:00";

  const seconds =
    Math.floor(ms / 1000);

  const minutes =
    Math.floor(seconds / 60);

  const remaining =
    seconds % 60;

  return `${minutes}:${String(
    remaining
  ).padStart(2, "0")}`;
}

function escapeHtml(text) {

  const div =
    document.createElement("div");

  div.textContent = text;

  return div.innerHTML;
}


/* =========================
   LOGOUT
========================= */

function logout() {

  localStorage.removeItem(
    "spotify_access_token"
  );

  localStorage.removeItem(
    "spotify_refresh_token"
  );

  localStorage.removeItem(
    "spotify_expires_at"
  );

  if (player) {
    player.disconnect();
  }

  accessToken = null;
  player = null;

  location.reload();
}


/* =========================
   INIT
========================= */

async function init() {

  try {

    await handleCallback();

    accessToken =
      await getToken();

    if (!accessToken) {

      $("loginScreen")
        .classList.remove("hidden");

      $("playerScreen")
        .classList.add("hidden");

      $("logoutBtn")
        .classList.add("hidden");

      return;
    }

    $("loginScreen")
      .classList.add("hidden");

    $("playerScreen")
      .classList.remove("hidden");

    $("playerBar")
      .classList.remove("hidden");

    $("loginBtn")
      .classList.add("hidden");

    $("logoutBtn")
      .classList.remove("hidden");

    await loadProfile();

  } catch (error) {

    console.error(error);

    $("status").textContent =
      "Er is een fout opgetreden.";
  }
}

init();
