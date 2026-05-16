import { useEffect, useState } from "react";
import {
  PersonalQR,
  commit,
  randomSalt,
  combineSalts,
  makeScanPayload,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };
type Player = { name: string; saltCommit: string };
type Reveals = Record<string, string>; // peerId -> salt

const NAME_KEY = (p: string) => `${p}:displayName`;
const SECRET_KEY = (p: string, peerId: string) => `${p}:wolf:secret:${peerId}`;

const ROLES = [
  "Werewolf",
  "Werewolf",
  "Seer",
  "Doctor",
  "Villager",
  "Villager",
  "Villager",
  "Villager",
];

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="viral-screen">
        <h1>werewolf roles</h1>
        <p className="viral-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY(config.storagePrefix)) ?? "",
  );
  const [, rerender] = useState(0);

  useEffect(() => {
    if (name) localStorage.setItem(NAME_KEY(config.storagePrefix), name);
  }, [name, config.storagePrefix]);

  useEffect(() => {
    const ps = room.doc.getMap<Player>("players");
    const meta = room.doc.getMap<string | Reveals>("meta");
    const cb = () => rerender((n) => n + 1);
    ps.observe(cb);
    meta.observe(cb);
    return () => {
      ps.unobserve(cb);
      meta.unobserve(cb);
    };
  }, [room]);

  const players = room.doc.getMap<Player>("players");
  const meta = room.doc.getMap<string | Reveals>("meta");
  const phase = (meta.get("phase") as string) ?? "lobby";
  const reveals = (meta.get("reveals") as Reveals | undefined) ?? {};

  const join = async () => {
    if (!name.trim()) return;
    const salt = randomSalt();
    const c = await commit("salt", salt);
    localStorage.setItem(SECRET_KEY(config.storagePrefix, room.peerId), salt);
    players.set(room.peerId, { name: name.trim(), saltCommit: c.hash });
  };

  const startGame = () => meta.set("phase", "reveal-salts");

  const revealSalt = () => {
    const salt = localStorage.getItem(SECRET_KEY(config.storagePrefix, room.peerId));
    if (!salt) return;
    const r: Reveals = { ...reveals, [room.peerId]: salt };
    meta.set("reveals", r);
  };

  const playerList: Array<Player & { id: string }> = [];
  players.forEach((p, k) => playerList.push({ ...p, id: k }));
  playerList.sort((a, b) => a.id.localeCompare(b.id));

  // Once all salts revealed, compute role assignment deterministically
  let myRole: string | null = null;
  let roleAssignments: Map<string, string> | null = null;
  if (playerList.length > 0 && Object.keys(reveals).length === playerList.length) {
    const salts = playerList.map((p) => reveals[p.id]!).filter(Boolean);
    if (salts.length === playerList.length) {
      const seed = combineSalts(salts);
      // Build deterministic permutation
      const ordered = playerList.slice().sort((a, b) => a.id.localeCompare(b.id));
      let s = Math.floor(seed * 0xffffffff);
      const rng = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const rolePool = ROLES.slice(0, ordered.length);
      // Fisher-Yates with seeded rng
      for (let i = rolePool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = rolePool[i]!;
        rolePool[i] = rolePool[j]!;
        rolePool[j] = tmp;
      }
      roleAssignments = new Map(ordered.map((p, i) => [p.id, rolePool[i]!]));
      myRole = roleAssignments.get(room.peerId) ?? null;
    }
  }

  const myPayload = makeScanPayload(room.roomId, room.peerId, name.trim() || "anon");
  const amInGame = players.has(room.peerId);

  return (
    <div className="viral-screen">
      <header>
        <h1>werewolf roles</h1>
        <p className="viral-status">
          {playerList.length} players · phase: {phase} · {Object.keys(reveals).length}/
          {playerList.length} salts revealed
        </p>
      </header>

      <input
        className="viral-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="your name"
        maxLength={48}
      />

      {phase === "lobby" && (
        <>
          {!amInGame ? (
            <button type="button" className="viral-primary" onClick={join} disabled={!name.trim()}>
              ✓ join — commit a salt
            </button>
          ) : (
            <button
              type="button"
              className="viral-primary"
              onClick={startGame}
              disabled={playerList.length < 3}
            >
              🎲 start game (need 3+)
            </button>
          )}
        </>
      )}

      {phase === "reveal-salts" && (
        <>
          {!(room.peerId in reveals) ? (
            <button type="button" className="viral-primary" onClick={revealSalt}>
              🔓 reveal my salt
            </button>
          ) : myRole ? (
            <div className={`wf-role wf-role-${myRole.toLowerCase()}`}>
              your role: <strong>{myRole}</strong>
            </div>
          ) : (
            <p className="viral-empty">
              waiting for {playerList.length - Object.keys(reveals).length} more salts…
            </p>
          )}
        </>
      )}

      <section>
        <h2 className="viral-section-title">players ({playerList.length})</h2>
        <ul className="viral-tags">
          {playerList.map((p) => (
            <li key={p.id} className={p.id === room.peerId ? "is-me" : ""}>
              <strong>{p.name}</strong>{" "}
              <span style={{ opacity: 0.5 }}>
                {p.id in reveals ? "✓ revealed" : "🔒 committed"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <details>
        <summary className="viral-section-title">my personal QR</summary>
        <PersonalQR payload={myPayload} size={160} />
      </details>
    </div>
  );
}
