import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { XMLParser } from "fast-xml-parser";
import multer from 'multer';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let Database: any;
try {
  Database = require('better-sqlite3');
} catch (err) {
  console.error("Failed to load better-sqlite3:", err);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize XML Parser
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

// Initialize Database
let db: any;
try {
  const dbPath = process.env.NODE_ENV === 'production' 
    ? '/tmp/audit_frete.db' 
    : 'audit_frete.db';
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  // Ensure schema exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cnpj TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS carriers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      cnpj TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS freight_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      carrier_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (carrier_id) REFERENCES carriers(id)
    );

    CREATE TABLE IF NOT EXISTS weight_ranges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      min_weight REAL NOT NULL,
      max_weight REAL NOT NULL,
      base_value REAL NOT NULL,
      kg_extra_value REAL DEFAULT 0,
      FOREIGN KEY (table_id) REFERENCES freight_tables(id)
    );

    CREATE TABLE IF NOT EXISTS zip_ranges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      start_zip TEXT NOT NULL,
      end_zip TEXT NOT NULL,
      region_name TEXT,
      ad_valorem_pct REAL DEFAULT 0,
      gris_pct REAL DEFAULT 0,
      pedagio_per_100kg REAL DEFAULT 0,
      tas_value REAL DEFAULT 0,
      tde_value REAL DEFAULT 0,
      FOREIGN KEY (table_id) REFERENCES freight_tables(id)
    );

    CREATE TABLE IF NOT EXISTS ctes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      xml_key TEXT UNIQUE NOT NULL,
      carrier_cnpj TEXT NOT NULL,
      tomador_cnpj TEXT NOT NULL,
      total_value REAL NOT NULL,
      weight REAL NOT NULL,
      origin_zip TEXT,
      dest_zip TEXT,
      origin_city TEXT,
      dest_city TEXT,
      cfop TEXT,
      icms_value REAL,
      icms_base REAL,
      icms_rate REAL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cte_id INTEGER NOT NULL,
      calculated_value REAL NOT NULL,
      difference REAL NOT NULL,
      divergence_type TEXT,
      status TEXT DEFAULT 'open',
      contestation_reason TEXT,
      audit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cte_id) REFERENCES ctes(id)
    );

    CREATE TABLE IF NOT EXISTS memory_calculations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT,
      soltransp TEXT,
      origem TEXT,
      destino TEXT,
      peso REAL,
      frete_valor REAL,
      obs TEXT,
      icms REAL,
      pedagios REAL,
      seguro REAL,
      frete_peso REAL,
      frete_all_in REAL,
      calculated_total REAL,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS table_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      user TEXT DEFAULT 'ADMIN_LOG',
      import_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      validation_date DATETIME,
      processing_date DATETIME,
      qty_imported INTEGER DEFAULT 0,
      qty_errors INTEGER DEFAULT 0,
      qty_total INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success'
    );

    CREATE TABLE IF NOT EXISTS import_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL,
      row_number INTEGER,
      error_message TEXT,
      raw_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (import_id) REFERENCES table_imports(id)
    );
  `);

  // Seed initial data safely
  const tenantId = 1;
  const carrierId = 1;
  db.prepare("INSERT OR IGNORE INTO tenants (id, name, cnpj) VALUES (?, ?, ?)").run(tenantId, "Empresa Exemplo S.A.", "12.345.678/0001-90");
  db.prepare("INSERT OR IGNORE INTO carriers (id, tenant_id, name, cnpj) VALUES (?, ?, ?, ?)").run(carrierId, tenantId, "R&R ISA'S TRANSPORTES LTDA", "35856333000100");
  db.prepare("INSERT OR IGNORE INTO freight_tables (id, tenant_id, carrier_id, name, version) VALUES (1, ?, ?, ?, ?)").run(tenantId, carrierId, "Tabela Padrão 2026", "v1.0");
  
  const tableId = 1;
  db.prepare("INSERT OR IGNORE INTO weight_ranges (id, table_id, min_weight, max_weight, base_value, kg_extra_value) VALUES (1, ?, ?, ?, ?, ?)").run(tableId, 0, 1000, 500.00, 0.50);
  db.prepare("INSERT OR IGNORE INTO weight_ranges (id, table_id, min_weight, max_weight, base_value, kg_extra_value) VALUES (2, ?, ?, ?, ?, ?)").run(tableId, 1000, 10000, 2500.00, 0.35);
  db.prepare("INSERT OR IGNORE INTO weight_ranges (id, table_id, min_weight, max_weight, base_value, kg_extra_value) VALUES (3, ?, ?, ?, ?, ?)").run(tableId, 10000, 50000, 5000.00, 0.25);

} catch (err) {
  console.error("Database initialization failed:", err);
  // We don't exit, so the server can still start and return errors instead of crashing
}


// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Health check route (no DB required)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", environment: process.env.NODE_ENV });
});

// API Routes
app.use((req, res, next) => {
  if (!db) {
    return res.status(503).json({ error: "Banco de dados não disponível. Verifique os logs do servidor." });
  }
  next();
});

app.get("/api/dashboard", (req, res) => {
    const stats = {
      total_audited: db.prepare("SELECT count(*) as count FROM ctes WHERE status = 'audited'").get(),
      total_divergences: db.prepare("SELECT count(*) as count FROM audits WHERE difference > 0.01 OR difference < -0.01").get(),
      recovered_value: db.prepare("SELECT sum(difference) as total FROM audits WHERE difference > 0").get(),
      recent_audits: db.prepare(`
        SELECT c.xml_key, c.total_value, a.calculated_value, a.difference, a.divergence_type 
        FROM audits a 
        JOIN ctes c ON a.cte_id = c.id 
        ORDER BY a.audit_date DESC LIMIT 5
      `).all()
    };
    res.json(stats);
  });

  // Refactored XML processing logic into a reusable function
  const processXml = (xmlContent: string, tenantId: number = 1) => {
    const jsonObj = parser.parse(xmlContent);
    const cteProc = jsonObj.cteProc || jsonObj['cteProc'];
    const CTe = cteProc?.CTe || jsonObj?.CTe;
    const infCte = CTe?.infCte;

    if (!infCte) {
      console.error("Invalid XML structure", JSON.stringify(jsonObj, null, 2));
      throw new Error("XML de CT-e inválido ou estrutura não reconhecida (infCte não encontrado).");
    }

    const xmlKey = infCte["@_Id"]?.replace("CTe", "") || infCte["Id"]?.replace("CTe", "");
    if (!xmlKey) throw new Error("Chave do CT-e não encontrada no XML.");

    // Check if CTE already exists
    const existingCte = db.prepare('SELECT id FROM ctes WHERE xml_key = ?').get(xmlKey);
    if (existingCte) {
      console.log(`Skipping existing CTE: ${xmlKey}`);
      return { success: false, message: 'CT-e já importado.', xmlKey };
    }

    const carrierCnpj = infCte.emit?.CNPJ;
    const totalValue = parseFloat(infCte.vPrest?.vTPrest || "0");
    const cfop = infCte.ide?.CFOP;
    const originCity = infCte.ide?.xMunIni;
    const destCity = infCte.ide?.xMunFim;
    const originZip = infCte.rem?.enderReme?.CEP;
    const destZip = infCte.dest?.enderDest?.CEP;
    const imp = infCte.imp;
    const icmsData = imp?.ICMS?.ICMS00 || imp?.ICMS?.ICMS20 || imp?.ICMS?.ICMS45;
    const icmsValue = parseFloat(icmsData?.vICMS || "0");
    const icmsBase = parseFloat(icmsData?.vBC || "0");
    const icmsRate = parseFloat(icmsData?.pICMS || "0");

    let weight = 0;
    const infQ = infCte.infCTeNorm?.infCarga?.infQ;
    if (Array.isArray(infQ)) {
      const weightObj = infQ.find((q: any) => q.tpMed === "PESO BRUTO");
      weight = parseFloat(weightObj?.qCarga || "0");
    } else if (infQ?.tpMed === "PESO BRUTO") {
      weight = parseFloat(infQ.qCarga || "0");
    }

    let tomadorCnpj = "";
    const tomaType = infCte.ide?.toma3?.toma || infCte.ide?.toma4?.toma;
    if (tomaType === 0 || tomaType === "0") tomadorCnpj = infCte.rem?.CNPJ;
    else if (tomaType === 3 || tomaType === "3") tomadorCnpj = infCte.dest?.CNPJ;
    else tomadorCnpj = infCte.rem?.CNPJ || "";

    const tomadorCnpjValue = tomadorCnpj || "";

    if (!carrierCnpj) {
      throw new Error("CNPJ do transportador (emitente) não encontrado no XML.");
    }
    if (!tomadorCnpjValue) {
      throw new Error("CNPJ do tomador do serviço não pôde ser determinado a partir do XML.");
    }

    const insertCte = db.prepare(`
      INSERT INTO ctes (tenant_id, xml_key, carrier_cnpj, tomador_cnpj, total_value, weight, origin_zip, dest_zip, origin_city, dest_city, cfop, icms_value, icms_base, icms_rate, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertCte.run(tenantId, xmlKey, carrierCnpj, tomadorCnpjValue, totalValue, weight, originZip, destZip, originCity, destCity, cfop, icmsValue, icmsBase, icmsRate, 'audited');
    const cteId = result.lastInsertRowid;

    const carrier = db.prepare("SELECT id FROM carriers WHERE cnpj = ?").get(carrierCnpj) as { id: number };
    const table = carrier ? db.prepare("SELECT id FROM freight_tables WHERE tenant_id = ? AND carrier_id = ? AND is_active = 1 LIMIT 1").get(tenantId, carrier.id) as { id: number } : null;

    let calculated = 0;
    let divergenceType = null;

    if (table) {
      const weightRange = db.prepare("SELECT * FROM weight_ranges WHERE table_id = ? AND ? BETWEEN min_weight AND max_weight").get(table.id, weight) as any;
      if (weightRange) {
        calculated = weightRange.base_value;
        if (weightRange.kg_extra_value > 0 && weight > weightRange.min_weight) {
          calculated += (weight - weightRange.min_weight) * weightRange.kg_extra_value;
        }
      } else {
        calculated = totalValue;
        divergenceType = 'weight_error';
      }
    } else {
      calculated = totalValue;
      divergenceType = 'table_error';
    }

    const diff = totalValue - calculated;
    if (Math.abs(diff) > 0.01) {
      divergenceType = divergenceType || 'value_divergence';
    }

    db.prepare(`
      INSERT INTO audits (cte_id, calculated_value, difference, divergence_type)
      VALUES (?, ?, ?, ?)
    `).run(cteId, calculated, diff, divergenceType);

    return { success: true, cteId, xmlKey };
  }

  app.post("/api/upload-batch", upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const results = [];
    let processedCount = 0;
    let errorCount = 0;

    for (const file of req.files as Express.Multer.File[]) {
      try {
        if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
          const zip = await JSZip.loadAsync(file.buffer);
          for (const filename in zip.files) {
            if (filename.toLowerCase().endsWith('.xml')) {
              const xmlContent = await zip.files[filename].async('string');
              try {
                const result = processXml(xmlContent);
                results.push(result);
                if(result.success) processedCount++; else errorCount++;
              } catch (e: any) {
                errorCount++;
                results.push({ success: false, message: e.message, filename });
              }
            }
          }
        } else if (file.mimetype === 'text/xml' || file.mimetype === 'application/xml' || file.originalname.endsWith('.xml')) {
          const xmlContent = file.buffer.toString('utf-8');
          const result = processXml(xmlContent);
          results.push(result);
          if(result.success) processedCount++; else errorCount++;
        } else {
          // Optionally handle other file types or ignore
        }
      } catch (error: any) {
        errorCount++;
        results.push({ success: false, message: error.message, filename: file.originalname });
      }
    }

    res.json({ 
      message: `Processamento concluído. ${processedCount} arquivos importados, ${errorCount} falhas.`,
      results 
    });
  });

  app.get("/api/audits", (req, res) => {
    const { startDate, endDate, carrierCnpj, status } = req.query;

    let query = `
      SELECT a.*, c.xml_key, c.total_value as charged_value, c.weight, car.name as carrier_name, c.origin_city, c.dest_city, c.cfop
      FROM audits a
      JOIN ctes c ON a.cte_id = c.id
      LEFT JOIN carriers car ON c.carrier_cnpj = car.cnpj
    `;

    const params: any[] = [];
    const conditions: string[] = [];

    if (startDate) {
      conditions.push(`date(a.audit_date) >= ?`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`date(a.audit_date) <= ?`);
      params.push(endDate);
    }
    if (carrierCnpj) {
      conditions.push(`c.carrier_cnpj = ?`);
      params.push(carrierCnpj);
    }
    if (status) {
      if (status === 'divergent') {
        conditions.push(`a.status = 'open' AND ABS(a.difference) >= 0.01`);
      } else if (status === 'conciliado') {
        conditions.push(`ABS(a.difference) < 0.01`);
      } else {
        conditions.push(`a.status = ?`);
        params.push(status);
      }
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY a.audit_date DESC`;

    try {
      const audits = db.prepare(query).all(params);
      res.json(audits);
    } catch (error: any) {
      console.error("Filter Audit Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/audits/divergent', (req, res) => {
    const audits = db.prepare(`
      SELECT a.*, c.xml_key, c.total_value as charged_value, c.weight, car.name as carrier_name, c.origin_city, c.dest_city, c.cfop
      FROM audits a
      JOIN ctes c ON a.cte_id = c.id
      LEFT JOIN carriers car ON c.carrier_cnpj = car.cnpj
      WHERE a.status = 'open' AND a.difference != 0
      ORDER BY a.audit_date DESC
    `).all();
    res.json(audits);
  });

  app.put('/api/memory-calculations/:id/waive', (req, res) => {
    db.prepare(`UPDATE memory_calculations SET status = 'ABONADO' WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/abonos', (req, res) => {
    try {
      const divergentAudits = db.prepare(`
        SELECT 
          a.id, 
          c.xml_key as identifier, 
          'Auditoria de CT-e' as description,
          a.difference,
          'audit' as type,
          a.audit_date as date,
          c.total_value as charged_value,
          a.calculated_value
        FROM audits a
        JOIN ctes c ON a.cte_id = c.id
        WHERE a.status = 'open' AND ABS(a.difference) >= 0.01
      `).all();

      const memoryCalcErrors = db.prepare(`
        SELECT
          id,
          codigo as identifier,
          'Memória de Cálculo' as description,
          (frete_all_in - calculated_total) as difference,
          'memory_calc' as type,
          created_at as date,
          frete_all_in as charged_value,
          calculated_total as calculated_value
        FROM memory_calculations
        WHERE status = 'ERRO DE CONCILIAÇÃO'
      `).all();

      const allAbonos = [...divergentAudits, ...memoryCalcErrors];
      allAbonos.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      res.json(allAbonos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/aprovacoes', (req, res) => {
    try {
      const approvedAudits = db.prepare(`
        SELECT 
          a.id, 
          c.xml_key as identifier, 
          'Auditoria de CT-e' as description,
          a.difference,
          'audit' as type,
          a.audit_date as date,
          c.total_value as charged_value,
          a.calculated_value
        FROM audits a
        JOIN ctes c ON a.cte_id = c.id
        WHERE a.status = 'waived'
      `).all();

      const approvedMemoryCalcs = db.prepare(`
        SELECT
          id,
          codigo as identifier,
          'Memória de Cálculo' as description,
          (frete_all_in - calculated_total) as difference,
          'memory_calc' as type,
          created_at as date,
          frete_all_in as charged_value,
          calculated_total as calculated_value
        FROM memory_calculations
        WHERE status = 'ABONADO'
      `).all();

      const allAprovacoes = [...approvedAudits, ...approvedMemoryCalcs];
      allAprovacoes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      res.json(allAprovacoes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cte/:id", (req, res) => {
    const { id } = req.params;
    const cte = db.prepare(`
      SELECT c.*, car.name as carrier_name
      FROM ctes c
      LEFT JOIN carriers car ON c.carrier_cnpj = car.cnpj
      WHERE c.id = ?
    `).get(id);
    res.json(cte);
  });

  app.get("/api/carriers", (req, res) => {
    const carriers = db.prepare("SELECT * FROM carriers WHERE tenant_id = 1").all();
    res.json(carriers);
  });

  app.post("/api/carriers", (req, res) => {
    const { name, cnpj, tenantId = 1 } = req.body;
    try {
      const result = db.prepare("INSERT INTO carriers (tenant_id, name, cnpj) VALUES (?, ?, ?)")
                       .run(tenantId, name, cnpj);
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/carriers/:id", (req, res) => {
    const { id } = req.params;
    const { name, cnpj } = req.body;
    try {
      db.prepare("UPDATE carriers SET name = ?, cnpj = ? WHERE id = ? AND tenant_id = 1")
        .run(name, cnpj, id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/freight-tables", (req, res) => {
    const tables = db.prepare(`
      SELECT ft.*, c.name as carrier_name 
      FROM freight_tables ft 
      JOIN carriers c ON ft.carrier_id = c.id 
      WHERE ft.tenant_id = 1
    `).all();
    res.json(tables);
  });

  app.post("/api/contest", (req, res) => {
    const { auditId, reason } = req.body;
    db.prepare("UPDATE audits SET status = 'contested', contestation_reason = ? WHERE id = ?").run(reason, auditId);
    res.json({ success: true });
  });

  app.get("/api/memory-calculations", (req, res) => {
    try {
      const calculations = db.prepare("SELECT * FROM memory_calculations ORDER BY id DESC").all();
      res.json(calculations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/audits/:id/waive', (req, res) => {
    db.prepare(`UPDATE audits SET status = 'waived' WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/memory-calculations", (req, res) => {
    try {
      db.prepare("DELETE FROM memory_calculations").run();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/table-imports", (req, res) => {
    try {
      const imports = db.prepare("SELECT * FROM table_imports ORDER BY import_date DESC").all();
      res.json(imports);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/table-imports/:id/errors", (req, res) => {
    try {
      const errors = db.prepare("SELECT * FROM import_errors WHERE import_id = ? ORDER BY row_number ASC").all(req.params.id);
      res.json(errors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/table-imports/upload", upload.array('files'), (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      }

      const results = [];
      
      const insertImportStmt = db.prepare(`
        INSERT INTO table_imports (filename, user, validation_date, processing_date, qty_imported, qty_errors, qty_total, status)
        VALUES (?, ?, ?, ?, 0, 0, 0, 'processing')
      `);

      const updateImportStmt = db.prepare(`
        UPDATE table_imports 
        SET qty_imported = ?, qty_errors = ?, qty_total = ?, status = ?
        WHERE id = ?
      `);

      const insertErrorStmt = db.prepare(`
        INSERT INTO import_errors (import_id, row_number, error_message, raw_data)
        VALUES (?, ?, ?, ?)
      `);

      const insertMemoryStmt = db.prepare(`
        INSERT INTO memory_calculations (
          codigo, soltransp, origem, destino, peso, frete_valor, obs,
          icms, pedagios, seguro, frete_peso, frete_all_in, calculated_total, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const file of req.files as Express.Multer.File[]) {
        const now = new Date().toISOString();
        let imported = 0;
        let errors = 0;
        
        try {
          // 1. Create import record first to get ID
          const info = insertImportStmt.run(
            file.originalname,
            'ADMIN_LOG',
            now,
            now
          );
          const importId = info.lastInsertRowid;

          const workbook = XLSX.read(file.buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(sheet); 

          db.transaction(() => {
            let rowNum = 1; // Header is 1, data starts at 2
            for (const row of data as any[]) {
              rowNum++;
              try {
                const getNum = (val: any) => {
                  if (typeof val === 'number') return val;
                  if (typeof val === 'string') return parseFloat(val.replace(',', '.')) || 0;
                  return 0;
                };

                const peso = getNum(row['PESO'] || row['peso']);
                const codigo = String(row['CÓDIGO'] || row['CDIGO'] || row['codigo'] || '').trim();
                const soltransp = String(row['SOLTRANSP'] || row['soltransp'] || '').trim();
                const origem = String(row['ORIGEM'] || row['origem'] || '').trim();
                const destino = String(row['DESTINO'] || row['destino'] || '').trim();
                const frete_valor = getNum(row['FRETE'] || row['frete']);
                const obs = String(row['OBS'] || row['obs'] || '').trim();
                const icms = getNum(row['ICMS'] || row['icms']);
                const pedagios = getNum(row['PEDÁGIOS'] || row['PEDGIOS'] || row['pedagios']);
                const seguro = getNum(row['SEGURO'] || row['seguro']);
                const frete_peso = getNum(row['FRETE PESO'] || row['frete_peso']);
                const frete_all_in = getNum(row['FRETE ALL IN'] || row['frete_all_in']);

                let status = '';
                let errorMsg = '';

                // Validation Logic
                if (!codigo || !soltransp) {
                  errorMsg = 'CÓDIGO ou SOLTRANSP ausente ou inválido';
                } else if (!origem || !destino) {
                  errorMsg = 'ORIGEM ou DESTINO ausente ou inválido';
                }

                if (errorMsg) {
                  errors++;
                  insertErrorStmt.run(importId, rowNum, errorMsg, JSON.stringify(row));
                } else {
                  // New Reconciliation Logic
                  if (!frete_all_in || frete_all_in <= 0) {
                    errorMsg = 'FRETE ALL IN ausente ou inválido, conciliação impossível.';
                  } else {
                    const calculated_total = icms + pedagios + seguro + frete_peso;
                    const diff = Math.abs(calculated_total - frete_all_in);
                    
                    if (diff <= 0.05) {
                      status = 'CONCILIADO';
                    } else {
                      status = 'ERRO DE CONCILIAÇÃO';
                    }

                    insertMemoryStmt.run(
                      codigo, soltransp, origem, destino, peso, frete_valor, obs,
                      icms, pedagios, seguro, frete_peso, frete_all_in, calculated_total, status
                    );
                    imported++;
                  }
                }
                
              } catch (err: any) {
                console.error("Error inserting row", err);
                errors++;
                insertErrorStmt.run(importId, rowNum, `Erro interno: ${err.message}`, JSON.stringify(row));
              }
            }
          })();

          const total = imported + errors;
          const fileStatus = errors > 0 ? 'warning' : 'success';

          // 2. Update import record with final stats
          updateImportStmt.run(imported, errors, total, fileStatus, importId);
          
          results.push({ filename: file.originalname, status: 'success' });

        } catch (err: any) {
          console.error("Error processing file", file.originalname, err);
          // If we failed before creating the record, we can't update it. 
          // But if we have importId (which we should if insertImportStmt ran), we update it to error.
          // For simplicity, if the whole file fails, we just log it.
          results.push({ filename: file.originalname, status: 'error', message: err.message });
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    }).then(vite => {
      app.use(vite.middlewares);
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    });
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      res.sendFile(indexPath, (err) => {
        if (err) {
          res.status(500).send("Error: index.html not found. Please ensure the project is built correctly.");
        }
      });
    });
  }

export default app;
