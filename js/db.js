const DB_NOME = "oratoria-diaria";
const DB_VERSAO = 3; // índices + store de conquistas
const STORES = ["perfil", "atividades", "gravacoes", "textos", "conquistas"];

let conexao;

/**
 * Abre (ou cria) a conexão com o IndexedDB. Retorna uma promise singleton.
 * Inclui índices para consultas frequentes (data, exercicioId, tipo, criadoEm).
 */
export function abrirDB() {
  if (conexao) return conexao;
  conexao = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onblocked = () => {
      console.warn("IndexedDB bloqueado por outra aba/janela.");
    };
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains("perfil")) {
        db.createObjectStore("perfil", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("atividades")) {
        const os = db.createObjectStore("atividades", { keyPath: "id" });
        os.createIndex("por_data", "data", { unique: false });
        os.createIndex("por_exercicio", "exercicioId", { unique: false });
      }
      if (!db.objectStoreNames.contains("gravacoes")) {
        const os = db.createObjectStore("gravacoes", { keyPath: "id" });
        os.createIndex("por_criado", "criadoEm", { unique: false });
      }
      if (!db.objectStoreNames.contains("textos")) {
        const os = db.createObjectStore("textos", { keyPath: "id" });
        os.createIndex("por_tipo", "tipo", { unique: false });
        os.createIndex("por_atualizado", "atualizadoEm", { unique: false });
      }
      if (!db.objectStoreNames.contains("conquistas")) {
        db.createObjectStore("conquistas", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return conexao;
}

export async function obter(store, key) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, "readonly").objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function todos(store) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, "readonly").objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

/**
 * Salva múltiplos itens em uma única transação (mais rápido que salvar um por um).
 */
export async function salvarLote(store, itens) {
  if (!itens || !itens.length) return [];
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    itens.forEach((item) => os.put(item));
    tx.oncomplete = () => resolve(itens);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function salvar(store, item) {
  const r = await salvarLote(store, [item]);
  return r[0];
}

export async function remover(store, key) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function limparStore(store) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function blobParaDataURL(blob) {
  if (!(blob instanceof Blob)) return null;
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataURLParaBlob(dataURL) {
  if (!dataURL || !dataURL.includes(",")) return null;
  const [cabecalho, conteudo] = String(dataURL).split(",");
  const tipo = (cabecalho.match(/data:(.*?);base64/) || [])[1] || "application/octet-stream";
  try {
    const binario = atob(conteudo || "");
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new Blob([bytes], { type: tipo });
  } catch (e) {
    return null;
  }
}

export async function exportarTudo() {
  const dados = { versao: 1, exportadoEm: new Date().toISOString(), stores: {} };
  const storesExportar = ["perfil", "atividades", "gravacoes", "textos", "conquistas"];
  for (const s of storesExportar) {
    const itens = await todos(s);
    if (s === "gravacoes") {
      dados.stores[s] = await Promise.all(itens.map(async (item) => {
        const copia = { ...item };
        if (copia.blob instanceof Blob) {
          copia.audioDataURL = await blobParaDataURL(copia.blob);
          delete copia.blob;
        }
        return copia;
      }));
    } else {
      dados.stores[s] = itens;
    }
  }
  return dados;
}

export async function importarTudo(dados) {
  if (!dados || !dados.stores) throw new Error("Arquivo de backup inválido.");
  const storesImportar = ["perfil", "atividades", "gravacoes", "textos", "conquistas"].filter(s => Array.isArray(dados.stores[s]));
  if (!storesImportar.length) throw new Error("Nenhuma store válida no backup.");

  // Valida TODOS os itens ANTES de limpar qualquer store (evita perda de dados).
  for (const s of storesImportar) {
    for (const item of dados.stores[s]) {
      if (!item || typeof item !== "object" || !item.id) {
        throw new Error(`Item inválido na store "${s}".`);
      }
    }
  }

  const db = await abrirDB();
  const tx = db.transaction(storesImportar, "readwrite");
  for (const s of storesImportar) {
    const os = tx.objectStore(s);
    os.clear();
    for (const original of dados.stores[s]) {
      const item = { ...original };
      if (s === "gravacoes" && item.audioDataURL) {
        item.blob = dataURLParaBlob(item.audioDataURL);
        delete item.audioDataURL;
      }
      os.put(item);
    }
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
