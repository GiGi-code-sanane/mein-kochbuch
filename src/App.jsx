import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "meinkochbuch_rezepte";
const SETTINGS_KEY = "meinkochbuch_settings";
const KATEGORIEN = ["Alle", "Frühstück", "Mittagessen", "Abendessen", "Snack", "Dessert", "Sonstiges"];

const initialRezepte = [
  {
    id: "demo1",
    name: "Spaghetti Carbonara",
    kategorie: "Abendessen",
    notizen: "Klassisches italienisches Rezept. Kein Sahne benutzen!",
    youtube: "https://www.youtube.com/watch?v=3AAdKl1UYZs",
    foto: null,
    zutaten: "Spaghetti, Pancetta, Eier, Pecorino, Pfeffer",
    erstellt: new Date().toISOString(),
  },
];

function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}
function getYoutubeThumbnail(url) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}
export default function MeinKochbuch() {
  const [rezepte, setRezepte] = useState(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : initialRezepte; }
    catch { return initialRezepte; }
  });
  const [settings, setSettings] = useState(() => {
    try { const s = localStorage.getItem(SETTINGS_KEY); return s ? JSON.parse(s) : { youtubeApiKey: "" }; }
    catch { return { youtubeApiKey: "" }; }
  });

  const [ansicht, setAnsicht] = useState("liste");
  const [gewaehltes, setGewaehltes] = useState(null);
  const [suchbegriff, setSuchbegriff] = useState("");
  const [aktiveKategorie, setAktiveKategorie] = useState("Alle");
  const [wochenplan, setWochenplan] = useState(null);
  const [wochenplanLaed, setWochenplanLaed] = useState(false);
  const [formular, setFormular] = useState({ name: "", kategorie: "Abendessen", notizen: "", youtube: "", zutaten: "", foto: null });
  const [fotoPreview, setFotoPreview] = useState(null);
  const [toast, setToast] = useState(null);
  const fotoRef = useRef();

  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistVideos, setPlaylistVideos] = useState([]);
  const [playlistLaed, setPlaylistLaed] = useState(false);
  const [ausgewaehlteVideos, setAusgewaehlteVideos] = useState({});
  const [notizText, setNotizText] = useState("");
  const [notizLaed, setNotizLaed] = useState(false);
  const [importierteRezepte, setImportierteRezepte] = useState([]);
  const [importSchritt, setImportSchritt] = useState("eingabe");

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(rezepte)); }, [rezepte]);
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);

  function zeigToast(msg, typ = "ok") {
    setToast({ msg, typ });
    setTimeout(() => setToast(null), 2800);
  }

  function rezeptSpeichern() {
    if (!formular.name.trim()) { zeigToast("Bitte einen Namen eingeben!", "fehler"); return; }
    const neues = { ...formular, id: Date.now().toString(), erstellt: new Date().toISOString() };
    setRezepte(prev => [neues, ...prev]);
    setFormular({ name: "", kategorie: "Abendessen", notizen: "", youtube: "", zutaten: "", foto: null });
    setFotoPreview(null);
    setAnsicht("liste");
    zeigToast("Rezept gespeichert! 🎉");
  }

  function rezeptLoeschen(id) {
    setRezepte(prev => prev.filter(r => r.id !== id));
    setAnsicht("liste");
    zeigToast("Rezept gelöscht.");
  }

  function fotoWaehlen(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setFotoPreview(ev.target.result); setFormular(f => ({ ...f, foto: ev.target.result })); };
    reader.readAsDataURL(file);
  }

  function getPlaylistId(url) {
    const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }
  async function playlistLaden() {
    const pid = getPlaylistId(playlistUrl);
    if (!pid) { zeigToast("Kein gültiger Playlist-Link!", "fehler"); return; }
    if (!settings.youtubeApiKey) { zeigToast("Bitte zuerst YouTube API Key in ⚙️ eingeben!", "fehler"); return; }
    setPlaylistLaed(true);
    setPlaylistVideos([]);
    try {
      let videos = [];
      let pageToken = "";
      do {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${pid}${pageToken ? `&pageToken=${pageToken}` : ""}&key=${settings.youtubeApiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        videos = videos.concat(data.items.map(item => ({
          id: item.snippet.resourceId.videoId,
          titel: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
          url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
        })));
        pageToken = data.nextPageToken || "";
      } while (pageToken && videos.length < 200);
      setPlaylistVideos(videos);
      const sel = {};
      videos.forEach(v => { sel[v.id] = true; });
      setAusgewaehlteVideos(sel);
    } catch (e) {
      zeigToast("Fehler: " + e.message, "fehler");
    }
    setPlaylistLaed(false);
  }

  function playlistImportieren() {
    const zuImportieren = playlistVideos.filter(v => ausgewaehlteVideos[v.id]);
    if (zuImportieren.length === 0) { zeigToast("Keine Videos ausgewählt!", "fehler"); return; }
    const vorhandeneUrls = new Set(rezepte.map(r => r.youtube));
    const neueRezepte = zuImportieren
      .filter(v => !vorhandeneUrls.has(v.url))
      .map(v => ({
        id: Date.now().toString() + Math.random(),
        name: v.titel,
        kategorie: "Sonstiges",
        notizen: "",
        youtube: v.url,
        foto: v.thumbnail,
        zutaten: "",
        erstellt: new Date().toISOString(),
      }));
    if (neueRezepte.length === 0) { zeigToast("Alle Videos bereits vorhanden!", "fehler"); return; }
    setRezepte(prev => [...neueRezepte, ...prev]);
    zeigToast(`${neueRezepte.length} Rezepte importiert! 🎉`);
    setPlaylistVideos([]);
    setPlaylistUrl("");
    setAnsicht("liste");
  }

  async function notizAnalysieren() {
    if (!notizText.trim()) { zeigToast("Bitte Text einfügen!", "fehler"); return; }
    setNotizLaed(true);
    setImportierteRezepte([]);
    setImportSchritt("eingabe");
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `Du bist ein Koch-Assistent. Analysiere den folgenden Text aus Apple Notizen und extrahiere alle Rezepte.\n\nText:\n${notizText}\n\nAntworte NUR mit einem JSON-Array ohne Backticks:\n[{"name": "Rezeptname", "kategorie": "Frühstück|Mittagessen|Abendessen|Snack|Dessert|Sonstiges", "zutaten": "Zutat1, Zutat2...", "notizen": "Zubereitung", "youtube": ""}]\n\nWenn kein Rezept: []`
          }]
        })
      });
      const data = await response.json();
      const text = data.content?.map(c => c.text || "").join("") || "[]";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      if (parsed.length === 0) { zeigToast("Keine Rezepte gefunden.", "fehler"); }
      else { setImportierteRezepte(parsed); setImportSchritt("vorschau"); }
    } catch (e) {
      zeigToast("KI-Fehler. Bitte nochmal.", "fehler");
    }
    setNotizLaed(false);
  }

  function notizRezepteSpeichern() {
    const neueRezepte = importierteRezepte.map(r => ({
      ...r, id: Date.now().toString() + Math.random(), foto: null, erstellt: new Date().toISOString(),
    }));
    setRezepte(prev => [...neueRezepte, ...prev]);
    zeigToast(`${neueRezepte.length} Rezepte importiert! 🎉`);
    setNotizText(""); setImportierteRezepte([]); setImportSchritt("eingabe");
    setAnsicht("liste");
  }

  async function wochenplanErstellen() {
    if (rezepte.length === 0) { zeigToast("Du hast noch keine Rezepte!", "fehler"); return; }
    setWochenplanLaed(true); setAnsicht("wochenplan"); setWochenplan(null);
    const rezeptliste = rezepte.map(r => `- ${r.name} (${r.kategorie})`).join("\n");
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: `Hier sind meine Rezepte:\n${rezeptliste}\n\nErstelle einen Wochenplan Montag-Sonntag. Antworte NUR mit JSON ohne Backticks: {"tage": [{"tag": "Montag", "fruehstueck": "...", "mittagessen": "...", "abendessen": "..."}]}` }]
        })
      });
      const data = await response.json();
      const text = data.content?.map(c => c.text || "").join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setWochenplan(parsed.tage);
    } catch { zeigToast("KI-Fehler.", "fehler"); setWochenplan(null); }
    setWochenplanLaed(false);
  }

  const gefilterteRezepte = rezepte.filter(r => {
    const passKat = aktiveKategorie === "Alle" || r.kategorie === aktiveKategorie;
    const passSuche = r.name.toLowerCase().includes(suchbegriff.toLowerCase()) || (r.zutaten && r.zutaten.toLowerCase().includes(suchbegriff.toLowerCase()));
    return passKat && passSuche;
  });

  const TAGE_FARBEN = ["#FF6B6B","#FF8E53","#FFC857","#6BCB77","#4D96FF","#C77DFF","#FF6BCC"];

  const S = {
    btn: (bg, color) => ({ padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", background: bg, color, fontSize: 13, fontWeight: 700 }),
    roundBtn: { width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer", background: "rgba(255,255,255,0.15)", color: "#f5e6d0", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" },
    tag: { fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "rgba(255,179,71,0.15)", color: "#FFB347", border: "1px solid rgba(255,179,71,0.2)" },
    sectionTitle: { fontSize: 13, color: "rgba(255,220,150,0.7)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 },
    karte: { background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "14px", border: "1px solid rgba(255,200,100,0.1)", fontSize: 15, lineHeight: 1.6, color: "#f5e6d0" },
    input: { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,200,100,0.25)", background: "rgba(255,255,255,0.06)", color: "#f5e6d0", fontSize: 15, boxSizing: "border-box", outline: "none", fontFamily: "Georgia, serif" },
  };
  return (
    <div style={{ fontFamily: "'Georgia', serif", minHeight: "100vh", background: "linear-gradient(135deg, #1a0a00 0%, #2d1500 50%, #1a0a00 100%)", color: "#f5e6d0", maxWidth: 480, margin: "0 auto" }}>

      <div style={{ background: "linear-gradient(180deg, rgba(180,90,10,0.97) 0%, rgba(120,55,5,0.95) 100%)", padding: "env(safe-area-inset-top, 16px) 20px 16px", position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid rgba(255,200,100,0.3)", backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 4, color: "rgba(255,220,150,0.6)", textTransform: "uppercase" }}>Mein</div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#FFE0A0" }}>🍳 Kochbuch</h1>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setAnsicht("neu")} style={S.btn("#FFE0A0", "#2d1500")}>+ Rezept</button>
            <button onClick={() => { setAnsicht("import"); setImportSchritt("eingabe"); }} style={S.btn("#4D96FF", "#000d2d")}>📥 Import</button>
            <button onClick={wochenplanErstellen} style={S.btn("#6BCB77", "#0a2d10")}>📅 Plan</button>
          </div>
        </div>
      </div>

      {toast && <div style={{ position: "fixed", top: 90, left: "50%", transform: "translateX(-50%)", background: toast.typ === "fehler" ? "#c0392b" : "#27ae60", color: "white", padding: "10px 20px", borderRadius: 20, fontSize: 14, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>{toast.msg}</div>}

      {ansicht === "liste" && (
        <div style={{ padding: "16px 16px 120px" }}>
          <input value={suchbegriff} onChange={e => setSuchbegriff(e.target.value)} placeholder="🔍 Rezept oder Zutat suchen…" style={{ ...S.input, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 14 }}>
            {KATEGORIEN.map(k => <button key={k} onClick={() => setAktiveKategorie(k)} style={{ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", whiteSpace: "nowrap", fontSize: 13, background: aktiveKategorie === k ? "#FFB347" : "rgba(255,255,255,0.1)", color: aktiveKategorie === k ? "#2d1500" : "#f5e6d0", fontWeight: aktiveKategorie === k ? 700 : 400 }}>{k}</button>)}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,220,150,0.5)", marginBottom: 12 }}>{gefilterteRezepte.length} von {rezepte.length} Rezepten</div>
          {gefilterteRezepte.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,220,150,0.5)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
              <div style={{ marginBottom: 16 }}>Keine Rezepte gefunden</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => setAnsicht("neu")} style={S.btn("#FFE0A0", "#2d1500")}>+ Manuell</button>
                <button onClick={() => setAnsicht("import")} style={S.btn("#4D96FF", "#000d2d")}>📥 Importieren</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {gefilterteRezepte.map(r => {
                const thumb = r.foto || getYoutubeThumbnail(r.youtube);
                return (
                  <div key={r.id} onClick={() => { setGewaehltes(r); setAnsicht("detail"); }} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, border: "1px solid rgba(255,200,100,0.15)", cursor: "pointer", overflow: "hidden", display: "flex" }}>
                    {thumb ? <img src={thumb} alt="" style={{ width: 90, height: 90, objectFit: "cover", flexShrink: 0 }} /> : <div style={{ width: 90, height: 90, background: "rgba(255,179,71,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0 }}>🍴</div>}
                    <div style={{ padding: "12px 14px", flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#FFE0A0", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: "#FFB347", marginBottom: 5 }}>{r.kategorie}</div>
                      {r.notizen && <div style={{ fontSize: 13, color: "rgba(245,230,208,0.55)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{r.notizen}</div>}
                      <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
                        {r.youtube && <span style={S.tag}>🎬 Video</span>}
                        {r.zutaten && <span style={S.tag}>📝 Zutaten</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {ansicht === "detail" && gewaehltes && (
        <div>
          <button onClick={() => setAnsicht("liste")} style={{ position: "fixed", top: 90, left: 12, zIndex: 10, ...S.roundBtn }}>←</button>
          <button onClick={() => rezeptLoeschen(gewaehltes.id)} style={{ position: "fixed", top: 90, right: 12, zIndex: 10, ...S.roundBtn, background: "rgba(192,57,43,0.85)" }}>🗑</button>
          {(gewaehltes.foto || getYoutubeThumbnail(gewaehltes.youtube)) ? (
            <div style={{ position: "relative", height: 230 }}>
              <img src={gewaehltes.foto || getYoutubeThumbnail(gewaehltes.youtube)} alt="" style={{ width: "100%", height: 230, objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(26,10,0,0.95) 0%, transparent 55%)" }} />
              <div style={{ position: "absolute", bottom: 16, left: 16 }}>
                <div style={{ fontSize: 12, color: "#FFB347", marginBottom: 4 }}>{gewaehltes.kategorie}</div>
                <h2 style={{ margin: 0, fontSize: 22, color: "#FFE0A0", fontWeight: 700 }}>{gewaehltes.name}</h2>
              </div>
            </div>
          ) : (
            <div style={{ height: 90, display: "flex", alignItems: "flex-end", padding: "0 16px 16px" }}>
              <div><div style={{ fontSize: 12, color: "#FFB347", marginBottom: 4 }}>{gewaehltes.kategorie}</div><h2 style={{ margin: 0, fontSize: 22, color: "#FFE0A0" }}>{gewaehltes.name}</h2></div>
            </div>
          )}
          <div style={{ padding: "20px 16px 120px" }}>
            {gewaehltes.youtube && getYouTubeId(gewaehltes.youtube) && (
              <div style={{ marginBottom: 20 }}>
                <div style={S.sectionTitle}>🎬 Video</div>
                <div style={{ borderRadius: 12, overflow: "hidden", aspectRatio: "16/9" }}>
                  <iframe src={`https://www.youtube.com/embed/${getYouTubeId(gewaehltes.youtube)}`} style={{ width: "100%", height: "100%", border: "none" }} allowFullScreen title={gewaehltes.name} />
                </div>
              </div>
            )}
            {gewaehltes.zutaten && <div style={{ marginBottom: 20 }}><div style={S.sectionTitle}>📝 Zutaten</div><div style={S.karte}>{gewaehltes.zutaten}</div></div>}
            {gewaehltes.notizen && <div style={{ marginBottom: 20 }}><div style={S.sectionTitle}>💬 Notizen</div><div style={S.karte}>{gewaehltes.notizen}</div></div>}
          </div>
        </div>
      )}

      {ansicht === "neu" && (
        <div style={{ padding: "16px 16px 120px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={() => setAnsicht("liste")} style={S.roundBtn}>←</button>
            <h2 style={{ margin: 0, fontSize: 20, color: "#FFE0A0" }}>Neues Rezept</h2>
          </div>
          {[{ label: "📛 Name *", key: "name", placeholder: "z.B. Mama's Gulasch" }, { label: "🎬 YouTube-Link", key: "youtube", placeholder: "https://youtube.com/watch?v=..." }, { label: "🥕 Zutaten", key: "zutaten", placeholder: "z.B. Mehl, Eier, Butter..." }].map(({ label, key, placeholder }) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: "rgba(255,220,150,0.8)", display: "block", marginBottom: 6 }}>{label}</label>
              <input value={formular[key]} onChange={e => setFormular(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} style={S.input} />
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: "rgba(255,220,150,0.8)", display: "block", marginBottom: 6 }}>🏷️ Kategorie</label>
            <select value={formular.kategorie} onChange={e => setFormular(f => ({ ...f, kategorie: e.target.value }))} style={{ ...S.input, cursor: "pointer" }}>
              {KATEGORIEN.filter(k => k !== "Alle").map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: "rgba(255,220,150,0.8)", display: "block", marginBottom: 6 }}>💬 Notizen</label>
            <textarea value={formular.notizen} onChange={e => setFormular(f => ({ ...f, notizen: e.target.value }))} placeholder="Tipps, Variationen…" rows={3} style={{ ...S.input, resize: "vertical" }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: "rgba(255,220,150,0.8)", display: "block", marginBottom: 6 }}>📷 Foto</label>
            <div onClick={() => fotoRef.current?.click()} style={{ border: "2px dashed rgba(255,200,100,0.3)", borderRadius: 14, padding: 20, textAlign: "center", cursor: "pointer", color: "rgba(255,220,150,0.5)", overflow: "hidden" }}>
              {fotoPreview ? <img src={fotoPreview} alt="" style={{ width: "100%", borderRadius: 8, maxHeight: 200, objectFit: "cover" }} /> : <div>📷 Foto auswählen</div>}
            </div>
            <input ref={fotoRef} type="file" accept="image/*" onChange={fotoWaehlen} style={{ display: "none" }} />
          </div>
          <button onClick={rezeptSpeichern} style={{ width: "100%", padding: 15, borderRadius: 14, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #FFB347, #FF8C00)", color: "#2d1500", fontSize: 17, fontWeight: 700 }}>✅ Rezept speichern</button>
        </div>
      )}
      {ansicht === "import" && (
        <div style={{ padding: "16px 16px 120px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={() => setAnsicht("liste")} style={S.roundBtn}>←</button>
            <h2 style={{ margin: 0, fontSize: 20, color: "#FFE0A0" }}>📥 Importieren</h2>
            <button onClick={() => setAnsicht("einstellungen")} style={{ marginLeft: "auto", ...S.roundBtn, fontSize: 18 }}>⚙️</button>
          </div>
          <div style={{ background: "rgba(255,50,50,0.08)", borderRadius: 16, border: "1px solid rgba(255,100,100,0.2)", padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#FF6B6B", marginBottom: 4 }}>🎬 YouTube Playlist</div>
            <div style={{ fontSize: 13, color: "rgba(255,220,150,0.6)", marginBottom: 12 }}>{settings.youtubeApiKey ? "✅ API Key gespeichert" : "⚠️ Kein API Key – bitte in ⚙️ eingeben"}</div>
            <input value={playlistUrl} onChange={e => setPlaylistUrl(e.target.value)} placeholder="https://youtube.com/playlist?list=..." style={{ ...S.input, marginBottom: 10 }} />
            <button onClick={playlistLaden} disabled={playlistLaed} style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", cursor: "pointer", background: playlistLaed ? "rgba(255,107,107,0.3)" : "#FF6B6B", color: "white", fontSize: 15, fontWeight: 700 }}>{playlistLaed ? "⏳ Lade Videos…" : "🔍 Playlist laden"}</button>
            {playlistVideos.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 14, color: "#FFE0A0", fontWeight: 700 }}>{playlistVideos.length} Videos</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { const s = {}; playlistVideos.forEach(v => s[v.id] = true); setAusgewaehlteVideos(s); }} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(255,255,255,0.15)", color: "#f5e6d0" }}>Alle</button>
                    <button onClick={() => setAusgewaehlteVideos({})} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(255,255,255,0.1)", color: "#f5e6d0" }}>Keine</button>
                  </div>
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {playlistVideos.map(v => (
                    <div key={v.id} onClick={() => setAusgewaehlteVideos(s => ({ ...s, [v.id]: !s[v.id] }))} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, cursor: "pointer", background: ausgewaehlteVideos[v.id] ? "rgba(255,107,107,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${ausgewaehlteVideos[v.id] ? "rgba(255,107,107,0.4)" : "rgba(255,255,255,0.08)"}` }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, border: "2px solid rgba(255,107,107,0.6)", background: ausgewaehlteVideos[v.id] ? "#FF6B6B" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white" }}>{ausgewaehlteVideos[v.id] ? "✓" : ""}</div>
                      {v.thumbnail && <img src={v.thumbnail} alt="" style={{ width: 56, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                      <div style={{ fontSize: 13, color: "#f5e6d0", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{v.titel}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,220,150,0.6)", margin: "10px 0" }}>{Object.values(ausgewaehlteVideos).filter(Boolean).length} ausgewählt</div>
                <button onClick={playlistImportieren} style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #FFB347, #FF8C00)", color: "#2d1500", fontSize: 15, fontWeight: 700 }}>✅ {Object.values(ausgewaehlteVideos).filter(Boolean).length} Rezepte importieren</button>
              </div>
            )}
          </div>
          <div style={{ background: "rgba(255,220,100,0.06)", borderRadius: 16, border: "1px solid rgba(255,220,100,0.2)", padding: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#FFC857", marginBottom: 4 }}>🍎 Apple Notizen → KI Import</div>
            <div style={{ fontSize: 13, color: "rgba(255,220,150,0.6)", marginBottom: 12 }}>Kopiere deinen Rezept-Text aus Apple Notizen und füge ihn hier ein.</div>
            {importSchritt === "eingabe" && (
              <>
                <textarea value={notizText} onChange={e => setNotizText(e.target.value)} placeholder="Text aus Apple Notizen hier einfügen…" rows={8} style={{ ...S.input, resize: "vertical", marginBottom: 10, fontSize: 14 }} />
                <button onClick={notizAnalysieren} disabled={notizLaed} style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", cursor: "pointer", background: notizLaed ? "rgba(255,200,70,0.3)" : "#FFC857", color: "#2d1500", fontSize: 15, fontWeight: 700 }}>{notizLaed ? "⏳ KI analysiert…" : "🤖 KI analysieren lassen"}</button>
              </>
            )}
            {importSchritt === "vorschau" && importierteRezepte.length > 0 && (
              <div>
                <div style={{ fontSize: 14, color: "#FFE0A0", fontWeight: 700, marginBottom: 12 }}>✨ {importierteRezepte.length} Rezepte erkannt:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                  {importierteRezepte.map((r, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 14px", border: "1px solid rgba(255,200,100,0.15)" }}>
                      <div style={{ fontWeight: 700, color: "#FFE0A0", marginBottom: 3 }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: "#FFB347", marginBottom: 4 }}>{r.kategorie}</div>
                      {r.zutaten && <div style={{ fontSize: 13, color: "rgba(245,230,208,0.7)" }}>📝 {r.zutaten}</div>}
                      {r.notizen && <div style={{ fontSize: 13, color: "rgba(245,230,208,0.6)", marginTop: 4 }}>💬 {r.notizen}</div>}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setImportSchritt("eingabe")} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer", background: "transparent", color: "#f5e6d0", fontSize: 14 }}>← Zurück</button>
                  <button onClick={notizRezepteSpeichern} style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #FFB347, #FF8C00)", color: "#2d1500", fontSize: 15, fontWeight: 700 }}>✅ Alle speichern</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {ansicht === "einstellungen" && (
        <div style={{ padding: "16px 16px 120px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={() => setAnsicht("import")} style={S.roundBtn}>←</button>
            <h2 style={{ margin: 0, fontSize: 20, color: "#FFE0A0" }}>⚙️ Einstellungen</h2>
          </div>
          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 16, border: "1px solid rgba(255,200,100,0.15)", marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#FFE0A0", marginBottom: 6 }}>🎬 YouTube Data API Key</div>
            <div style={{ fontSize: 13, color: "rgba(255,220,150,0.6)", marginBottom: 12, lineHeight: 1.6 }}>Kostenlos auf <strong style={{ color: "#4D96FF" }}>console.cloud.google.com</strong> → APIs & Services → YouTube Data API v3 → Anmeldedaten.</div>
            <input value={settings.youtubeApiKey} onChange={e => setSettings(s => ({ ...s, youtubeApiKey: e.target.value }))} placeholder="AIza..." type="password" style={S.input} />
          </div>
          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 16, border: "1px solid rgba(255,200,100,0.15)", marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "rgba(255,220,150,0.6)", marginBottom: 6 }}>📊 Statistik</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#FFE0A0" }}>{rezepte.length} Rezepte</div>
          </div>
          <button onClick={() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); zeigToast("Gespeichert! ✅"); }} style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #FFB347, #FF8C00)", color: "#2d1500", fontSize: 16, fontWeight: 700 }}>💾 Speichern</button>
        </div>
      )}

      {ansicht === "wochenplan" && (
        <div style={{ padding: "16px 16px 120px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={() => setAnsicht("liste")} style={S.roundBtn}>←</button>
            <h2 style={{ margin: 0, fontSize: 20, color: "#FFE0A0" }}>📅 Wochenplan</h2>
          </div>
          {wochenplanLaed && <div style={{ textAlign: "center", padding: "60px 0" }}><div style={{ fontSize: 48, marginBottom: 16, animation: "spin 1s linear infinite" }}>🍳</div><div style={{ color: "rgba(255,220,150,0.7)" }}>KI erstellt deinen Plan…</div></div>}
          {!wochenplanLaed && wochenplan && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {wochenplan.map((tag, i) => (
                <div key={tag.tag} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, border: `1px solid ${TAGE_FARBEN[i]}40`, overflow: "hidden" }}>
                  <div style={{ background: `${TAGE_FARBEN[i]}22`, padding: "10px 16px", borderBottom: `1px solid ${TAGE_FARBEN[i]}30` }}>
                    <span style={{ fontWeight: 700, color: TAGE_FARBEN[i], fontSize: 16 }}>{tag.tag}</span>
                  </div>
                  <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {[["☀️", "Frühstück", tag.fruehstueck], ["🌤️", "Mittagessen", tag.mittagessen], ["🌙", "Abendessen", tag.abendessen]].map(([icon, label, mahlzeit]) => (
                      <div key={label} style={{ display: "flex", gap: 10 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                        <div><div style={{ fontSize: 11, color: "rgba(255,220,150,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div><div style={{ fontSize: 14, color: "#f5e6d0" }}>{mahlzeit}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={wochenplanErstellen} style={{ padding: 13, borderRadius: 14, border: "1px solid rgba(107,203,119,0.3)", cursor: "pointer", background: "rgba(107,203,119,0.15)", color: "#6BCB77", fontSize: 15, marginTop: 4 }}>🔄 Neuen Plan erstellen</button>
            </div>
          )}
          {!wochenplanLaed && !wochenplan && (
            <div style={{ textAlign: "center", padding: 40, color: "rgba(255,220,150,0.5)" }}>
              <div style={{ fontSize: 48 }}>🤖</div>
              <div style={{ marginTop: 12 }}>Fehler. Bitte nochmal versuchen.</div>
              <button onClick={wochenplanErstellen} style={{ ...S.btn("#FFE0A0", "#2d1500"), marginTop: 16 }}>Nochmal</button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        ::-webkit-scrollbar { display: none; }
        input::placeholder, textarea::placeholder { color: rgba(245,230,208,0.3); }
        select option { background: #2d1500; color: #f5e6d0; }
        body { margin: 0; padding: 0; background: #1a0a00; }
      `}</style>
    </div>
  );
}
