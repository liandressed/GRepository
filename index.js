const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const PORT = process.env.PORT || 7004;
const TMDB_KEY = process.env.TMDB_KEY || "1587e42b775d238f0cd0615731a9c004";
const TMDB_BASE = "https://api.themoviedb.org/3";

// Keywords gay masculino no TMDB
const GAY_KEYWORDS = "9840|158718"; // gay romance | gay
const BL_KEYWORDS = "289844";       // boys love bl

// Catálogos de séries
const SERIES_CATALOGS = [
  { id: "gay-series-popular",  name: "🔥 Gay Populares",       sort: "popularity.desc",       keywords: GAY_KEYWORDS },
  { id: "gay-series-toprated", name: "⭐ Gay Mais Votados",     sort: "vote_average.desc",     keywords: GAY_KEYWORDS },
  { id: "gay-series-new",      name: "🆕 Gay Lançamentos",      sort: "first_air_date.desc",   keywords: GAY_KEYWORDS },
  { id: "gay-series-romance",  name: "💕 Gay Romance",          sort: "vote_count.desc",       keywords: GAY_KEYWORDS, genre: "10749" },
  { id: "gay-series-drama",    name: "🎭 Gay Drama",            sort: "vote_count.desc",       keywords: GAY_KEYWORDS, genre: "18" },
  { id: "gay-series-comedy",   name: "😄 Gay Comédia",          sort: "vote_count.desc",       keywords: GAY_KEYWORDS, genre: "35" },
  { id: "gay-series-thriller", name: "😱 Gay Thriller",         sort: "vote_count.desc",       keywords: GAY_KEYWORDS, genre: "9648" },
  { id: "gay-series-fantasy",  name: "✨ Gay Fantasia",          sort: "vote_count.desc",       keywords: GAY_KEYWORDS, genre: "10765" },
  { id: "bl-series-popular",   name: "🌸 BL Populares",         sort: "popularity.desc",       keywords: BL_KEYWORDS },
  { id: "bl-series-toprated",  name: "⭐ BL Mais Votados",      sort: "vote_average.desc",     keywords: BL_KEYWORDS },
  { id: "bl-series-new",       name: "🆕 BL Lançamentos",       sort: "first_air_date.desc",   keywords: BL_KEYWORDS },
];

// Catálogos de filmes
const MOVIE_CATALOGS = [
  { id: "gay-movies-popular",  name: "🔥 Gay Filmes Populares",    sort: "popularity.desc",     keywords: GAY_KEYWORDS },
  { id: "gay-movies-toprated", name: "⭐ Gay Filmes Mais Votados", sort: "vote_average.desc",   keywords: GAY_KEYWORDS },
  { id: "gay-movies-new",      name: "🆕 Gay Filmes Recentes",     sort: "release_date.desc",   keywords: GAY_KEYWORDS },
  { id: "gay-movies-romance",  name: "💕 Gay Filmes Romance",      sort: "vote_count.desc",     keywords: GAY_KEYWORDS, genre: "10749" },
  { id: "gay-movies-drama",    name: "🎭 Gay Filmes Drama",        sort: "vote_count.desc",     keywords: GAY_KEYWORDS, genre: "18" },
  { id: "gay-movies-comedy",   name: "😄 Gay Filmes Comédia",      sort: "vote_count.desc",     keywords: GAY_KEYWORDS, genre: "35" },
  { id: "gay-movies-thriller", name: "😱 Gay Filmes Thriller",     sort: "vote_count.desc",     keywords: GAY_KEYWORDS, genre: "53" },
  { id: "gay-movies-horror",   name: "🎃 Gay Filmes Terror",       sort: "vote_count.desc",     keywords: GAY_KEYWORDS, genre: "27" },
  { id: "bl-movies-popular",   name: "🌸 BL Filmes Populares",     sort: "popularity.desc",     keywords: BL_KEYWORDS },
  { id: "bl-movies-toprated",  name: "⭐ BL Filmes Mais Votados",  sort: "vote_average.desc",   keywords: BL_KEYWORDS },
];

const allCatalogs = [
  ...SERIES_CATALOGS.map(c => ({
    id: c.id, type: "series", name: c.name,
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"],
  })),
  ...MOVIE_CATALOGS.map(c => ({
    id: c.id, type: "movie", name: c.name,
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"],
  })),
];

const manifest = {
  id: "br.gaycatalog.stremio",
  version: "1.0.0",
  name: "Gay Catalog",
  description: "Catálogo de conteúdo gay e BL masculino organizado por gênero e popularidade.",
  logo: "https://image.tmdb.org/t/p/w200/ieePfhScQdToCEWzMuaskwYru0d.jpg",
  resources: ["catalog", "meta"],
  types: ["series", "movie"],
  catalogs: allCatalogs,
  idPrefixes: ["tt", "tmdb:"],
};

const builder = new addonBuilder(manifest);

// Cache
const cache = new Map();
function getCache(key) { return cache.get(key) ?? null; }
function setCache(key, value, ttlMs = 30 * 60 * 1000) {
  cache.set(key, value);
  setTimeout(() => cache.delete(key), ttlMs);
}

// TMDB discover
async function discover({ keywords, sort, genre, page = 1, mediaType = "tv" }) {
  const params = new URLSearchParams({
    api_key: TMDB_KEY,
    with_keywords: keywords,
    without_genres: "16", // sem anime
    sort_by: sort,
    page: String(page),
    "vote_count.gte": "5",
  });
  if (genre) params.set("with_genres", genre);

  const { data } = await axios.get(`${TMDB_BASE}/discover/${mediaType}?${params}`, { timeout: 10000 });
  return data;
}

// Busca IMDB IDs em lote
async function getImdbIds(tmdbIds, mediaType) {
  const results = [];
  for (let i = 0; i < tmdbIds.length; i += 5) {
    const batch = tmdbIds.slice(i, i + 5);
    const resolved = await Promise.all(batch.map(async (id) => {
      const cacheKey = `ext:${mediaType}:${id}`;
      const cached = getCache(cacheKey);
      if (cached) return cached;
      try {
        const endpoint = mediaType === "movie" ? "movie" : "tv";
        const { data } = await axios.get(`${TMDB_BASE}/${endpoint}/${id}/external_ids?api_key=${TMDB_KEY}`, { timeout: 8000 });
        const imdb = data.imdb_id || null;
        setCache(cacheKey, imdb, 7 * 24 * 60 * 60 * 1000);
        return imdb;
      } catch { return null; }
    }));
    results.push(...resolved);
  }
  return results;
}

// Catalog handler
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  const skip = parseInt(extra?.skip) || 0;
  const page = Math.floor(skip / 20) + 1;
  console.log(`[CATALOG] type=${type} id=${id} page=${page}`);

  const cacheKey = `cat:${id}:${page}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const mediaType = type === "movie" ? "movie" : "tv";
    const catConfig = [...SERIES_CATALOGS, ...MOVIE_CATALOGS].find(c => c.id === id);
    if (!catConfig) return { metas: [] };

    const data = await discover({
      keywords: catConfig.keywords,
      sort: catConfig.sort,
      genre: catConfig.genre || null,
      page,
      mediaType,
    });

    const shows = data.results || [];
    const tmdbIds = shows.map(s => s.id);
    const imdbIds = await getImdbIds(tmdbIds, mediaType);

    const metas = shows.map((show, i) => {
      const imdbId = imdbIds[i];
      const isMovie = mediaType === "movie";
      return {
        id: imdbId || `tmdb:${show.id}`,
        type,
        name: show.name || show.original_name || show.title || show.original_title,
        poster: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
        background: show.backdrop_path ? `https://image.tmdb.org/t/p/w1280${show.backdrop_path}` : null,
        description: show.overview,
        releaseInfo: isMovie ? show.release_date?.slice(0, 4) : show.first_air_date?.slice(0, 4),
      };
    }).filter(m => m.poster);

    console.log(`[CATALOG] ${metas.length} itens`);
    const result = { metas, hasMore: data.total_pages > page };
    setCache(cacheKey, result, 60 * 60 * 1000);
    return result;
  } catch (e) {
    console.error(`[CATALOG] Erro: ${e.message}`);
    return { metas: [] };
  }
});

// Meta handler para IDs tmdb:
builder.defineMetaHandler(async ({ type, id }) => {
  if (!id.startsWith("tmdb:")) return { meta: null };
  const tmdbId = id.replace("tmdb:", "");
  const cacheKey = `meta:${tmdbId}`;
  const cached = getCache(cacheKey);
  if (cached) return { meta: cached };

  try {
    const endpoint = type === "movie" ? "movie" : "tv";
    const { data } = await axios.get(`${TMDB_BASE}/${endpoint}/${tmdbId}`, {
      params: { api_key: TMDB_KEY, language: "pt-BR" },
      timeout: 10000,
    });
    const meta = {
      id, type,
      name: data.name || data.title,
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
      background: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : null,
      description: data.overview,
      releaseInfo: data.first_air_date?.slice(0, 4) || data.release_date?.slice(0, 4),
      genres: data.genres?.map(g => g.name),
    };
    setCache(cacheKey, meta, 24 * 60 * 60 * 1000);
    return { meta };
  } catch (e) {
    console.error(`[META] Erro: ${e.message}`);
    return { meta: null };
  }
});

serveHTTP(builder.getInterface(), { port: PORT });
console.log(`\n✅ Gay Catalog addon rodando em http://localhost:${PORT}`);
console.log(`📺 Instale no Stremio: http://localhost:${PORT}/manifest.json\n`);
