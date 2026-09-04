
/*
=========================================================
 MY SPOTIFY WEB PLAYER
 Spotify Web API + Spotify Web Playback SDK
=========================================================

 BELANGRIJK:
 1. Vul hieronder je Spotify Client ID in.
 2. Gebruik een Spotify Premium-account.
 3. Voeg je Vercel URL toe als Redirect URI in
    Spotify Developer Dashboard.
=========================================================
*/

const CLIENT_ID = "e9a02e5d46434f67b9cd8f7c45083003";

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state"
].join(" ");

const REDIRECT_URI =
  window.location.origin + window.location.pathname;


// ======================================================
// STATE
// ======================================================

let accessToken = null;
let player = null;
let deviceId = null;
let currentTrack = null;
let isPlayerReady = false;


// ======================================================
// SHORTCUT
// ======================================================

function $(id) {
  return document.getElementById(id);
}


// ======================================================
// PKCE
// ======================================================

function randomString(length = 64) {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    "abcdefghijklmnopqrstuvwxyz" +
    "0123456789-._~";

  const array =
    new Uint8Array(length);

  crypto.getRandomValues(array);

  return Array.from(array)
    .map(x => chars[x % chars.length])
    .join("");
}


async function sha256(text) {

  const encoder =
    new TextEncoder();

  return crypto.subtle.digest(
    "SHA-256",
    encoder.encode(text)
  );
}


function base64UrlEncode(buffer) {

  return btoa(
    String.fromCharCode(
      ...new Uint8Array(buffer)
    )
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


async function createCodeChallenge(verifier) {

  const hash =
    await sha256(verifier);

  return base64UrlEncode(hash);
}


// ======================================================
// LOGIN
// ======================================================

async function login() {

  if (
    !CLIENT_ID ||
    CLIENT_ID.includes("VUL_HIER")
  ) {

    alert(
      "Open app.js en vul je Spotify Client ID in."
    );

    return;
  }


  const verifier =
    randomString(64);

  const challenge =
    await createCodeChallenge(verifier);

  const state =
    randomString(32);


  localStorage.setItem(
    "spotify_code_verifier",
    verifier
  );

  localStorage.setItem(
    "spotify_state",
    state
  );


  const params =
    new URLSearchParams({

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


// ======================================================
// HANDLE SPOTIFY CALLBACK
// ======================================================

async function handleCallback() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const code =
    params.get("code");

  const state =
    params.get("state");

  const error =
    params.get("error");


  if (error) {

    console.error(
      "Spotify login error:",
      error
    );

    return;
  }


  if (!code) {
    return;
  }


  const savedState =
    localStorage.getItem(
      "spotify_state"
    );


  if (
    !savedState ||
    savedState !== state
  ) {

    alert(
      "Spotify security check mislukt."
    );

    return;
  }


  const verifier =
    localStorage.getItem(
      "spotify_code_verifier"
    );


  if (!verifier) {

    alert(
      "PKCE verifier ontbreekt."
    );

    return;
  }


  const body =
    new URLSearchParams({

      client_id: CLIENT_ID,

      grant_type:
        "authorization_code",

      code,

      redirect_uri:
        REDIRECT_URI,

      code_verifier:
        verifier
    });


  const response =
    await fetch(
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


  const data =
    await response.json();


  if (!response.ok) {

    console.error(
      "Token error:",
      data
    );

    alert(
      "Spotify login/token error."
    );

    return;
  }


  saveTokens(data);


  localStorage.removeItem(
    "spotify_code_verifier"
  );

  localStorage.removeItem(
    "spotify_state"
  );


  // Verwijder ?code= uit de URL
  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );
}


// ======================================================
// SAVE TOKENS
// ======================================================

function saveTokens(data) {

  accessToken =
    data.access_token;


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


  if (data.expires_in) {

    const expiresAt =
      Date.now() +
      data.expires_in * 1000;


    localStorage.setItem(
      "spotify_expires_at",
      String(expiresAt)
    );
  }
}


// ======================================================
// REFRESH TOKEN
// ======================================================

async function refreshToken() {

  const refreshToken =
    localStorage.getItem(
      "spotify_refresh_token"
    );


  if (!refreshToken) {
    return false;
  }


  const body =
    new URLSearchParams({

      grant_type:
        "refresh_token",

      refresh_token:
        refreshToken,

      client_id:
        CLIENT_ID
    });


  const response =
    await fetch(
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


  const data =
    await response.json();


  if (!response.ok) {

    console.error(
      "Refresh token error:",
      data
    );


    if (
      data.error ===
      "invalid_grant"
    ) {

      logout();
    }


    return false;
  }


  saveTokens(data);

  return true;
}


// ======================================================
// GET VALID TOKEN
// ======================================================

async function getToken() {

  const expiresAt =
    Number(
      localStorage.getItem(
        "spotify_expires_at"
      ) || 0
    );


  if (
    accessToken &&
    Date.now() <
      expiresAt - 60000
  ) {

    return accessToken;
  }


  accessToken =
    localStorage.getItem(
      "spotify_access_token"
    );


  if (
    accessToken &&
    Date.now() <
      expiresAt - 60000
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


// ======================================================
// SPOTIFY API FETCH
// ======================================================

async function spotifyFetch(
  url,
  options = {}
) {

  let token =
    await getToken();


  if (!token) {

    throw new Error(
      "Niet ingelogd bij Spotify."
    );
  }


  const headers = {

    ...(options.headers || {}),

    Authorization:
      `Bearer ${token}`
  };


  let response =
    await fetch(
      url,
      {
        ...options,
        headers
      }
    );


  // Token verlopen
  if (response.status === 401) {

    const refreshed =
      await refreshToken();


    if (!refreshed) {

      throw new Error(
        "Spotify login verlopen."
      );
    }


    token =
      await getToken();


    headers.Authorization =
      `Bearer ${token}`;


    response =
      await fetch(
        url,
        {
          ...options,
          headers
        }
      );
  }


  return response;
}


// ======================================================
// PROFILE
// ======================================================

async function loadProfile() {

  try {

    const response =
      await spotifyFetch(
        "https://api.spotify.com/v1/me"
      );


    if (!response.ok) {
      return;
    }


    const profile =
      await response.json();


    if ($("userName")) {

      $("userName").textContent =
        profile.display_name ||
        profile.id;
    }

  } catch (error) {

    console.error(
      "Profile error:",
      error
    );
  }
}


// ======================================================
// SEARCH
// ======================================================

async function searchTracks() {

  const input =
    $("searchInput");


  if (!input) {
    return;
  }


  const query =
    input.value.trim();


  if (!query) {
    return;
  }


  if ($("results")) {

    $("results").innerHTML =
      `
      <p style="
        color:#999;
        padding:20px;
      ">
        Zoeken...
      </p>
      `;
  }


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


    if (!response.ok) {

      console.error(data);

      throw new Error(
        "Search failed"
      );
    }


    displayResults(
      data.tracks?.items || []
    );

  } catch (error) {

    console.error(
      "Search error:",
      error
    );


    if ($("results")) {

      $("results").innerHTML =
        `
        <p style="color:#ff5555">
          Zoeken mislukt.
        </p>
        `;
    }
  }
}


// ======================================================
// DISPLAY SEARCH RESULTS
// ======================================================

function displayResults(tracks) {

  const container =
    $("results");


  if (!container) {
    return;
  }


  container.innerHTML = "";


  if (!tracks.length) {

    container.innerHTML =
      `
      <p style="color:#999">
        Geen nummers gevonden.
      </p>
      `;

    return;
  }


  tracks.forEach(track => {

    const element =
      document.createElement("div");


    element.className =
      "result";


    const image =
      track.album?.images?.[1]?.url ||
      track.album?.images?.[0]?.url ||
      "";


    const artists =
      track.artists
        .map(
          artist => artist.name
        )
        .join(", ");


    element.innerHTML =
      `
      <img
        src="${escapeHtml(image)}"
        alt=""
      >

      <div class="result-info">

        <strong>
          ${escapeHtml(track.name)}
        </strong>

        <span>
          ${escapeHtml(artists)}
        </span>

      </div>

      <button
        class="play-result"
        type="button"
      >
        ▶
      </button>
      `;


    const button =
      element.querySelector(
        ".play-result"
      );


    button.addEventListener(
      "click",
      () => {

        playTrack(
          track.uri
        );
      }
    );


    container.appendChild(
      element
    );
  });
}


// ======================================================
// SPOTIFY WEB PLAYBACK SDK
// ======================================================

async function initializeSpotifyPlayer() {

  if (player) {
    return;
  }


  const token =
    await getToken();


  if (!token) {

    console.log(
      "Geen Spotify token."
    );

    return;
  }


  if (!window.Spotify) {

    console.log(
      "Spotify SDK nog niet geladen."
    );

    return;
  }


  console.log(
    "Initializing Spotify Web Playback SDK..."
  );


  player =
    new Spotify.Player({

      name:
        "My Website Spotify Player",

      getOAuthToken:
        async callback => {

          const freshToken =
            await getToken();

          callback(
            freshToken
          );
        },

      volume: 0.7
    });


  // ----------------------------------------------------
  // READY
  // ----------------------------------------------------

  player.addListener(
    "ready",
    ({ device_id }) => {

      deviceId =
        device_id;

      isPlayerReady =
        true;


      console.log(
        "Spotify Web Playback device:",
        device_id
      );


      if ($("status")) {

        $("status").textContent =
          "Webplayer klaar ✓";
      }
    }
  );


  // ----------------------------------------------------
  // NOT READY
  // ----------------------------------------------------

  player.addListener(
    "not_ready",
    ({ device_id }) => {

      console.log(
        "Spotify device offline:",
        device_id
      );


      if (
        device_id ===
        deviceId
      ) {

        isPlayerReady =
          false;

        deviceId =
          null;
      }
    }
  );


  // ----------------------------------------------------
  // PLAYER STATE
  // ----------------------------------------------------

  player.addListener(
    "player_state_changed",
    state => {

      if (!state) {
        return;
      }


      currentTrack =
        state.track_window
          .current_track;


      if (currentTrack) {

        updateTrack(
          currentTrack
        );
      }


      if ($("playBtn")) {

        $("playBtn").textContent =
          state.paused
            ? "▶"
            : "Ⅱ";
      }


      if ($("progress")) {

        const percentage =
          state.duration
            ? (
                state.position /
                state.duration
              ) * 100
            : 0;


        $("progress").value =
          percentage;
      }


      if ($("currentTime")) {

        $("currentTime").textContent =
          formatTime(
            state.position
          );
      }


      if ($("duration")) {

        $("duration").textContent =
          formatTime(
            state.duration
          );
      }
    }
  );


  // ----------------------------------------------------
  // INITIALIZATION ERROR
  // ----------------------------------------------------

  player.addListener(
    "initialization_error",
    ({ message }) => {

      console.error(
        "Spotify initialization error:",
        message
      );


      if ($("status")) {

        $("status").textContent =
          "Spotify player kon niet starten.";
      }
    }
  );


  // ----------------------------------------------------
  // AUTH ERROR
  // ----------------------------------------------------

  player.addListener(
    "authentication_error",
    ({ message }) => {

      console.error(
        "Spotify authentication error:",
        message
      );


      if ($("status")) {

        $("status").textContent =
          "Spotify authenticatie mislukt.";
      }
    }
  );


  // ----------------------------------------------------
  // ACCOUNT ERROR
  // ----------------------------------------------------

  player.addListener(
    "account_error",
    ({ message }) => {

      console.error(
        "Spotify account error:",
        message
      );


      if ($("status")) {

        $("status").textContent =
          "Spotify Premium is vereist.";
      }
    }
  );


  // ----------------------------------------------------
  // PLAYBACK ERROR
  // ----------------------------------------------------

  player.addListener(
    "playback_error",
    ({ message }) => {

      console.error(
        "Spotify playback error:",
        message
      );


      if ($("status")) {

        $("status").textContent =
          "Spotify kon dit nummer niet afspelen.";
      }
    }
  );


  // ----------------------------------------------------
  // CONNECT
  // ----------------------------------------------------

  const connected =
    await player.connect();


  if (!connected) {

    console.error(
      "Spotify player connection failed."
    );


    if ($("status")) {

      $("status").textContent =
        "Webplayer kon niet verbinden.";
    }

    return;
  }


  console.log(
    "Spotify Web Playback SDK connected."
  );
}


// ======================================================
// PLAY TRACK
// ======================================================

async function playTrack(uri) {

  if (!uri) {
    return;
  }


  // Probeer player te initialiseren
  if (!player) {

    await initializeSpotifyPlayer();
  }


  // Wacht kort op device registration
  if (!deviceId) {

    if ($("status")) {

      $("status").textContent =
        "Webplayer wordt gestart...";
    }


    await waitForDevice(10000);
  }


  if (!deviceId) {

    if ($("status")) {

      $("status").textContent =
        "Webplayer is nog niet klaar.";
    }


    alert(
      "De Spotify Web Player is nog niet klaar. " +
      "Controleer of je Spotify Premium gebruikt en " +
      "of de Spotify SDK geladen is."
    );

    return;
  }


  try {

    const token =
      await getToken();


    if (!token) {

      alert(
        "Je Spotify login is verlopen."
      );

      return;
    }


    const response =
      await fetch(
        "https://api.spotify.com/v1/me/player/play" +
        "?device_id=" +
        encodeURIComponent(deviceId),
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


      console.error(
        "Playback request:",
        response.status,
        text
      );


      if ($("status")) {

        $("status").textContent =
          "Spotify kon het nummer niet starten.";
      }


      return;
    }


    if ($("status")) {

      $("status").textContent =
        "Nu aan het afspelen ✓";
    }

  } catch (error) {

    console.error(
      "Play error:",
      error
    );
  }
}


// ======================================================
// WAIT FOR SPOTIFY DEVICE
// ======================================================

function waitForDevice(
  timeout = 10000
) {

  return new Promise(resolve => {

    const start =
      Date.now();


    const check =
      setInterval(() => {

        if (deviceId) {

          clearInterval(check);

          resolve(true);

          return;
        }


        if (
          Date.now() - start >=
          timeout
        ) {

          clearInterval(check);

          resolve(false);
        }

      }, 200);
  });
}


// ======================================================
// PLAY / PAUSE
// ======================================================

async function togglePlay() {

  if (!player) {

    await initializeSpotifyPlayer();
  }


  if (!player) {
    return;
  }


  try {

    await player.togglePlay();

  } catch (error) {

    console.error(
      "Toggle play error:",
      error
    );
  }
}


// ======================================================
// NEXT
// ======================================================

async function nextTrack() {

  if (!player) {
    return;
  }


  try {

    await player.nextTrack();

  } catch (error) {

    console.error(
      "Next track error:",
      error
    );
  }
}


// ======================================================
// PREVIOUS
// ======================================================

async function previousTrack() {

  if (!player) {
    return;
  }


  try {

    await player.previousTrack();

  } catch (error) {

    console.error(
      "Previous track error:",
      error
    );
  }
}


// ======================================================
// VOLUME
// ======================================================

async function setVolume(value) {

  if (!player) {
    return;
  }


  try {

    await player.setVolume(
      Number(value) / 100
    );

  } catch (error) {

    console.error(
      "Volume error:",
      error
    );
  }
}


// ======================================================
// SEEK
// ======================================================

async function seek(value) {

  if (!player) {
    return;
  }


  const state =
    player.getCurrentState();


  if (!state) {
    return;
  }


  const position =
    (
      Number(value) / 100
    ) * state.duration;


  try {

    await player.seek(
      position
    );

  } catch (error) {

    console.error(
      "Seek error:",
      error
    );
  }
}


// ======================================================
// UPDATE CURRENT TRACK
// ======================================================

function updateTrack(track) {

  if (!track) {
    return;
  }


  if ($("trackName")) {

    $("trackName").textContent =
      track.name;
  }


  if ($("artistName")) {

    $("artistName").textContent =
      track.artists
        .map(
          artist => artist.name
        )
        .join(", ");
  }


  if ($("trackImage")) {

    $("trackImage").src =
      track.album?.images?.[0]?.url ||
      "";
  }
}


// ======================================================
// FORMAT TIME
// ======================================================

function formatTime(ms) {

  if (!ms) {
    return "0:00";
  }


  const seconds =
    Math.floor(ms / 1000);


  const minutes =
    Math.floor(seconds / 60);


  const remaining =
    seconds % 60;


  return (
    minutes +
    ":" +
    String(remaining)
      .padStart(2, "0")
  );
}


// ======================================================
// ESCAPE HTML
// ======================================================

function escapeHtml(text) {

  const div =
    document.createElement("div");


  div.textContent =
    text ?? "";


  return div.innerHTML;
}


// ======================================================
// LOGOUT
// ======================================================

function logout() {

  if (player) {

    try {
      player.disconnect();
    } catch (error) {
      console.error(error);
    }
  }


  player =
    null;

  deviceId =
    null;

  accessToken =
    null;

  isPlayerReady =
    false;


  localStorage.removeItem(
    "spotify_access_token"
  );

  localStorage.removeItem(
    "spotify_refresh_token"
  );

  localStorage.removeItem(
    "spotify_expires_at"
  );

  localStorage.removeItem(
    "spotify_code_verifier"
  );

  localStorage.removeItem(
    "spotify_state"
  );


  window.location.reload();
}


// ======================================================
// BUTTON EVENTS
// ======================================================

function setupEvents() {

  if ($("loginBtn")) {

    $("loginBtn").addEventListener(
      "click",
      login
    );
  }


  if ($("loginBtn2")) {

    $("loginBtn2").addEventListener(
      "click",
      login
    );
  }


  if ($("logoutBtn")) {

    $("logoutBtn").addEventListener(
      "click",
      logout
    );
  }


  if ($("searchBtn")) {

    $("searchBtn").addEventListener(
      "click",
      searchTracks
    );
  }


  if ($("searchInput")) {

    $("searchInput").addEventListener(
      "keydown",
      event => {

        if (event.key === "Enter") {

          searchTracks();
        }
      }
    );
  }


  if ($("playBtn")) {

    $("playBtn").addEventListener(
      "click",
      togglePlay
    );
  }


  if ($("nextBtn")) {

    $("nextBtn").addEventListener(
      "click",
      nextTrack
    );
  }


  if ($("previousBtn")) {

    $("previousBtn").addEventListener(
      "click",
      previousTrack
    );
  }


  if ($("volume")) {

    $("volume").addEventListener(
      "input",
      event => {

        setVolume(
          event.target.value
        );
      }
    );
  }


  if ($("progress")) {

    $("progress").addEventListener(
      "change",
      event => {

        seek(
          event.target.value
        );
      }
    );
  }
}


// ======================================================
// WAIT FOR SDK
// ======================================================

function waitForSpotifySDK() {

  return new Promise(resolve => {

    if (window.Spotify) {

      resolve();

      return;
    }


    const oldCallback =
      window.onSpotifyWebPlaybackSDKReady;


    window.onSpotifyWebPlaybackSDKReady =
      () => {

        if (oldCallback) {
          oldCallback();
        }

        resolve();
      };


    setTimeout(
      () => resolve(),
      10000
    );

  });
}


// ======================================================
// SHOW LOGGED-IN UI
// ======================================================

function showLoggedInUI() {

  if ($("loginScreen")) {

    $("loginScreen")
      .classList.add("hidden");
  }


  if ($("playerScreen")) {

    $("playerScreen")
      .classList.remove("hidden");
  }


  if ($("playerBar")) {

    $("playerBar")
      .classList.remove("hidden");
  }


  if ($("loginBtn")) {

    $("loginBtn")
      .classList.add("hidden");
  }


  if ($("logoutBtn")) {

    $("logoutBtn")
      .classList.remove("hidden");
  }
}


// ======================================================
// SHOW LOGGED-OUT UI
// ======================================================

function showLoggedOutUI() {

  if ($("loginScreen")) {

    $("loginScreen")
      .classList.remove("hidden");
  }


  if ($("playerScreen")) {

    $("playerScreen")
      .classList.add("hidden");
  }


  if ($("playerBar")) {

    $("playerBar")
      .classList.add("hidden");
  }


  if ($("loginBtn")) {

    $("loginBtn")
      .classList.remove("hidden");
  }


  if ($("logoutBtn")) {

    $("logoutBtn")
      .classList.add("hidden");
  }
}


// ======================================================
// MAIN INIT
// ======================================================

async function init() {

  console.log(
    "Starting My Spotify Player..."
  );


  setupEvents();


  // Spotify callback verwerken
  await handleCallback();


  // Token ophalen
  accessToken =
    await getToken();


  // Niet ingelogd
  if (!accessToken) {

    showLoggedOutUI();

    return;
  }


  // Ingelogd
  showLoggedInUI();


  if ($("status")) {

    $("status").textContent =
      "Spotify login actief...";
  }


  // Profiel
  await loadProfile();


  // Wacht tot Spotify SDK geladen is
  await waitForSpotifySDK();


  // Start Web Playback SDK
  await initializeSpotifyPlayer();
}


// ======================================================
// START
// ======================================================

init();
