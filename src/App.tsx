/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  LayoutDashboard, 
  FileUp, 
  ShieldCheck, 
  AlertTriangle, 
  TrendingUp, 
  Truck, 
  FileText,
  Printer,
  CheckCircle2,
  Bell,
  User,
  Search,
  ArrowRightLeft,
  Settings,
  Database,
  ChevronDown,
  Filter,
  Download,
  RefreshCw,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

// Types
interface Audit {
  id: number;
  xml_key: string;
  charged_value: number;
  calculated_value: number;
  difference: number;
  divergence_type: string | null;
  weight: number;
  carrier_cnpj: string;
  audit_date: string;
  status: string;
  contestation_reason?: string;
  origin_city?: string;
  dest_city?: string;
  cfop?: string;
}

interface DashboardStats {
  total_audited: { count: number };
  total_divergences: { count: number };
  recovered_value: { total: number | null };
  recent_audits: any[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'audits' | 'upload' | 'carriers' | 'tables' | 'settings' | 'memory' | 'abono' | 'import-tables'>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [tableImports, setTableImports] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [isCarrierModalOpen, setIsCarrierModalOpen] = useState(false);
  const [isCteModalOpen, setIsCteModalOpen] = useState(false);
  const [isContestModalOpen, setIsContestModalOpen] = useState(false);
  const [selectedAuditForContest, setSelectedAuditForContest] = useState<number | null>(null);
  const [contestReason, setContestReason] = useState('');
  const [selectedCte, setSelectedCte] = useState<any>(null);
  const [memoryCalculations, setMemoryCalculations] = useState<any[]>([]);
  const [editingCarrierId, setEditingCarrierId] = useState<number | null>(null);
  const [newCarrierName, setNewCarrierName] = useState('');
  const [newCarrierCnpj, setNewCarrierCnpj] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    carrierCnpj: '',
    status: ''
  });

  const [divergentAudits, setDivergentAudits] = useState<Audit[]>([]);
  const [selectedImportErrors, setSelectedImportErrors] = useState<any[]>([]);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);

  const FileUploadButton = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <label htmlFor="file-upload" className={`cursor-pointer ${className}`}>
      {children}
    </label>
  );

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    fetchStats();
    fetchAudits();
    fetchCarriers();
    fetchTables();
    fetchDivergentAudits();
    fetchMemoryCalculations();
    fetchTableImports();
  };

  const fetchTableImports = async () => {
    try {
      const res = await fetch('/api/table-imports');
      if (!res.ok) return;
      const data = await res.json();
      setTableImports(data);
    } catch (err) {
      console.error("Failed to fetch table imports", err);
    }
  };

  const handleTableImportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const res = await fetch('/api/table-imports/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        showNotification("Tabelas importadas com sucesso!");
        fetchTableImports();
      } else {
        showNotification("Erro ao importar tabelas.");
      }
    } catch (err) {
      showNotification("Erro de conexão.");
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleViewErrors = async (importId: number) => {
    try {
      const res = await fetch(`/api/table-imports/${importId}/errors`);
      if (res.ok) {
        const errors = await res.json();
        setSelectedImportErrors(errors);
        setIsErrorModalOpen(true);
      } else {
        showNotification("Não foi possível carregar os detalhes dos erros.");
      }
    } catch (error) {
      console.error("Error fetching errors:", error);
    }
  };

  const fetchMemoryCalculations = async () => {
    try {
      const res = await fetch('/api/memory-calculations');
      if (!res.ok) {
        const errorText = await res.text();
        showNotification(`Erro ao carregar cálculos: ${errorText}`);
        console.error('Failed to fetch memory calculations', res.status, errorText);
        return;
      }
      const data = await res.json();
      setMemoryCalculations(data);
    } catch (err: any) {
      console.error("Failed to fetch memory calculations", err);
      showNotification(`Erro de conexão: ${err.message}`);
    }
  };

  const fetchDivergentAudits = async () => {
    try {
      const res = await fetch('/api/audits/divergent');
      if (!res.ok) {
        const errorText = await res.text();
        showNotification(`Erro ao carregar divergências: ${errorText}`);
        return;
      }
      const data = await res.json();
      setDivergentAudits(data);
    } catch (err: any) {
      console.error("Failed to fetch divergent audits", err);
      showNotification(`Erro de conexão: ${err.message}`);
    }
  };

  const handleWaiveAudit = async (auditId: number) => {
    try {
      const res = await fetch(`/api/audits/${auditId}/waive`, { method: 'PUT' });
      if (res.ok) {
        showNotification('Auditoria abonada com sucesso.');
        refreshData();
      } else {
        showNotification('Erro ao abonar auditoria.');
      }
    } catch (err) {
      showNotification('Erro de conexão ao abonar.');
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) {
        const errorText = await res.text();
        showNotification(`Erro ao carregar painel: ${errorText}`);
        return;
      }
      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      console.error("Failed to fetch stats", err);
      showNotification(`Erro de conexão: ${err.message}`);
    }
  };

  const fetchAudits = async (currentFilters = filters) => {
    try {
      const params = new URLSearchParams();
      if (currentFilters.startDate) params.append('startDate', currentFilters.startDate);
      if (currentFilters.endDate) params.append('endDate', currentFilters.endDate);
      if (currentFilters.carrierCnpj) params.append('carrierCnpj', currentFilters.carrierCnpj);
      if (currentFilters.status) params.append('status', currentFilters.status);

      const res = await fetch(`/api/audits?${params.toString()}`);
      if (!res.ok) {
        const errorText = await res.text();
        showNotification(`Erro ao carregar auditorias: ${errorText}`);
        return;
      }
      const data = await res.json();
      setAudits(data);
    } catch (err: any) {
      console.error("Failed to fetch audits", err);
      showNotification(`Erro de conexão: ${err.message}`);
    }
  };

  const fetchCarriers = async () => {
    try {
      const res = await fetch('/api/carriers');
      if (!res.ok) {
        const errorText = await res.text();
        showNotification(`Erro ao carregar transportadoras: ${errorText}`);
        return;
      }
      const data = await res.json();
      setCarriers(data);
    } catch (err: any) {
      console.error("Failed to fetch carriers", err);
      showNotification(`Erro de conexão: ${err.message}`);
    }
  };

  const fetchTables = async () => {
    try {
      const res = await fetch('/api/freight-tables');
      if (!res.ok) {
        const errorText = await res.text();
        showNotification(`Erro ao carregar tabelas: ${errorText}`);
        return;
      }
      const data = await res.json();
      setTables(data);
    } catch (err: any) {
      console.error("Failed to fetch tables", err);
      showNotification(`Erro de conexão: ${err.message}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadSuccess(false);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const res = await fetch('/api/upload-batch', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (res.ok) {
        showNotification(result.message || "Arquivos processados com sucesso!");
        refreshData();
        setUploadSuccess(true);
        if (result.results?.some((r:any) => !r.success)) {
          // Partial success
        } 
      } else {
        showNotification(`Erro: ${result.error || 'Falha no upload.'}`);
      }
    } catch (err) {
      console.error("Upload failed", err);
      showNotification("Erro de conexão ao enviar arquivos.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const applyFilters = () => {
    fetchAudits(filters);
    showNotification("Filtros aplicados!");
    setIsFilterModalOpen(false);
  };

  const handleExportXLS = () => {
    if (audits.length === 0) {
      showNotification("Não há dados para exportar.");
      return;
    }

    // Custom headers in Portuguese
    const header = [
      "Data Auditoria",
      "Chave CT-e",
      "CNPJ Transportadora",
      "Cidade Origem",
      "Cidade Destino",
      "Peso (kg)",
      "Valor Cobrado (R$)",
      "Valor Calculado (R$)",
      "Diferença (R$)",
      "Status",
      "Motivo Contestação"
    ];

    const data = audits.map(audit => ({
      "Data Auditoria": new Date(audit.audit_date).toLocaleDateString('pt-BR'),
      "Chave CT-e": audit.xml_key,
      "CNPJ Transportadora": audit.carrier_cnpj,
      "Cidade Origem": audit.origin_city,
      "Cidade Destino": audit.dest_city,
      "Peso (kg)": audit.weight,
      "Valor Cobrado (R$)": audit.charged_value,
      "Valor Calculado (R$)": audit.calculated_value,
      "Diferença (R$)": audit.difference,
      "Status": audit.status,
      "Motivo Contestação": audit.contestation_reason || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data, { header });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Auditoria");

    // Trigger file download
    XLSX.writeFile(workbook, "Relatorio_Auditoria_Fretes.xlsx");
    showNotification("Exportação para Excel iniciada.");
  };

  const handleDownloadTemplate = () => {
    const header = [
      "PESO", 
      "CÓDIGO", 
      "SOLTRANSP", 
      "ORIGEM", 
      "DESTINO", 
      "FRETE", 
      "OBS", 
      "ICMS", 
      "PEDÁGIOS",
      "SEGURO",
      "FRETE PESO",
      "FRETE ALL IN"
    ];
    const data = [
      ["10.50", "12345", "98765", "SAO PAULO", "RIO DE JANEIRO", "0.00", "ENTREGA URGENTE", "12.00", "5.00", "1.50", "81.50", "100.00"],
      ["5.00", "12346", "98766", "CURITIBA", "FLORIANOPOLIS", "0.00", "", "8.00", "2.00", "0.50", "49.50", "60.00"]
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Modelo Conciliacao");
    XLSX.writeFile(workbook, "Modelo_Conciliacao_Frete.xlsx");
    showNotification("Modelo de planilha baixado com sucesso.");
  };

  const handleContest = (auditId: number) => {
    setSelectedAuditForContest(auditId);
    setContestReason('');
    setIsContestModalOpen(true);
  };

  const submitContest = async () => {
    if (!selectedAuditForContest || !contestReason) return;
    
    try {
      const res = await fetch('/api/contest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditId: selectedAuditForContest, reason: contestReason })
      });
      if (res.ok) {
        showNotification("Contestação enviada para a transportadora.");
        setIsContestModalOpen(false);
        fetchAudits();
      }
    } catch (err) {
      showNotification("Erro ao enviar contestação.");
    }
  };

  const handleViewCte = async (cteId: number) => {
    try {
      const res = await fetch(`/api/cte/${cteId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedCte(data);
        setIsCteModalOpen(true);
      } else {
        showNotification("Erro ao carregar detalhes do CT-e.");
      }
    } catch (err) {
      console.error("Failed to fetch CTE", err);
      showNotification("Erro ao carregar detalhes do CT-e.");
    }
  };

  const handleCreateCarrier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCarrierName || !newCarrierCnpj) return;

    try {
      const url = editingCarrierId ? `/api/carriers/${editingCarrierId}` : '/api/carriers';
      const method = editingCarrierId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCarrierName, cnpj: newCarrierCnpj })
      });
      if (res.ok) {
        showNotification(editingCarrierId ? "Transportadora atualizada com sucesso!" : "Transportadora cadastrada com sucesso!");
        setIsCarrierModalOpen(false);
        setEditingCarrierId(null);
        setNewCarrierName('');
        setNewCarrierCnpj('');
        fetchCarriers();
      } else {
        const data = await res.json();
        showNotification(`Erro: ${data.error || 'Falha ao processar'}`);
      }
    } catch (err) {
      console.error("Failed to save carrier", err);
      showNotification("Erro ao salvar transportadora.");
    }
  };

  const openEditCarrier = (carrier: any) => {
    setEditingCarrierId(carrier.id);
    setNewCarrierName(carrier.name);
    setNewCarrierCnpj(carrier.cnpj);
    setIsCarrierModalOpen(true);
  };

  const openNewCarrier = () => {
    setEditingCarrierId(null);
    setNewCarrierName('');
    setNewCarrierCnpj('');
    setIsCarrierModalOpen(true);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const COLORS = ['#1e40af', '#f59e0b', '#dc2626', '#475569'];

  return (
    <div className="h-screen bg-[#E5E7EB] flex flex-col font-sans text-slate-900">
      <input 
        type="file" 
        accept=".xml,.zip"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        id="file-upload"
        multiple
      />

      {/* Filter Modal */}
      <AnimatePresence>
        {isFilterModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl border border-slate-300 rounded-lg shadow-xl overflow-hidden"
            >
              <div className="bg-slate-100 text-slate-800 px-4 py-2 flex justify-between items-center border-b border-slate-300">
                <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <Filter size={14} /> Filtros Avançados do Relatório
                </h3>
                <button onClick={() => setIsFilterModalOpen(false)} className="hover:bg-slate-200 p-1 rounded-full">
                  <ChevronDown size={16} className="rotate-180" />
                </button>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data Início</label>
                    <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="tms-input" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data Fim</label>
                    <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="tms-input" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Transportadora</label>
                  <select name="carrierCnpj" value={filters.carrierCnpj} onChange={handleFilterChange} className="tms-input">
                    <option value="">Todas</option>
                    {carriers.map(c => <option key={c.id} value={c.cnpj}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Status da Auditoria</label>
                  <select name="status" value={filters.status} onChange={handleFilterChange} className="tms-input">
                    <option value="">Todos</option>
                    <option value="conciliado">Conciliado</option>
                    <option value="divergent">Erro na Tarifa</option>
                    <option value="contested">Contestado</option>
                    <option value="waived">Abonado</option>
                  </select>
                </div>
              </div>
              <div className="bg-slate-50 px-6 py-3 flex justify-end gap-3 border-t border-slate-200">
                <button 
                  type="button"
                  onClick={() => setIsFilterModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 font-bold uppercase text-xs rounded hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button 
                  onClick={applyFilters}
                  className="px-4 py-2 bg-blue-800 text-white font-bold uppercase text-xs rounded hover:bg-blue-900 shadow"
                >
                  Aplicar Filtros
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 20 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-50 bg-[#1E3A8A] text-white px-6 py-3 rounded-md shadow-2xl border border-blue-400 font-bold text-xs uppercase tracking-widest flex items-center gap-3"
          >
            <Bell size={16} className="text-emerald-400" />
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Navigation Bar */}
      <header className="h-12 bg-[#1E3A8A] text-white flex items-center justify-between px-4 shadow-md z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-400 w-5 h-5" />
            <span className="font-bold text-lg tracking-tight">TMS AUDIT v2.4</span>
          </div>
          <nav className="flex h-full">
            <TopNavItem label="Arquivo" onClick={() => showNotification("Menu Arquivo")} />
            <TopNavItem label="Movimentação" active onClick={() => showNotification("Menu Movimentação")} />
            <TopNavItem label="Relatórios" onClick={() => setActiveTab('audits')} />
            <TopNavItem label="Cadastros" onClick={() => setActiveTab('carriers')} />
            <TopNavItem label="Utilitários" onClick={() => setActiveTab('settings')} />
            <TopNavItem label="Ajuda" onClick={() => showNotification("Suporte Técnico: 0800-TMS-AUDIT")} />
          </nav>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-2 border-r border-blue-700 pr-4">
            <Database size={14} className="text-blue-300" />
            <span>DB: PRODUCAO_SUL</span>
          </div>
          <div className="flex items-center gap-2">
            <User size={14} className="text-blue-300" />
            <span>USUÁRIO: ADMIN_LOG</span>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="h-10 bg-[#F3F4F6] border-b border-slate-300 flex items-center px-4 gap-2 shadow-sm">
        <ToolbarButton icon={<LayoutDashboard size={16} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <ToolbarButton icon={<FileUp size={16} />} label="Importar XML" active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} />
        <ToolbarButton icon={<ArrowRightLeft size={16} />} label="Auditoria" active={activeTab === 'audits'} onClick={() => setActiveTab('audits')} />
        <ToolbarButton icon={<CheckCircle2 size={16} />} label="Abono" active={activeTab === 'abono'} onClick={() => setActiveTab('abono')} />
        <div className="w-[1px] h-6 bg-slate-300 mx-1"></div>
        <ToolbarButton icon={<RefreshCw size={16} />} label="Atualizar" onClick={() => { refreshData(); showNotification("Dados atualizados."); }} />
        <ToolbarButton icon={<Printer size={16} />} label="Imprimir" onClick={() => window.print()} />
        <ToolbarButton icon={<Download size={16} />} label="Exportar" onClick={() => showNotification("Exportando dados para Excel...")} />
        <div className="flex-1"></div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Pesquisar CT-e..." 
            className="pl-8 pr-2 py-1 bg-white border border-slate-300 rounded text-xs w-48 focus:outline-none focus:border-blue-500"
            onChange={(e) => {
              if (e.target.value.length > 5) showNotification(`Buscando: ${e.target.value}`);
            }}
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-[#F9FAFB] border-r border-slate-300 flex flex-col hidden md:flex">
          <div className="p-3 bg-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-300">
            Menu de Navegação
          </div>
          <nav className="flex-1 overflow-y-auto">
            <SidebarGroup label="Operacional">
              <SidebarItem icon={<FileUp size={16} />} label="Importação CT-e" active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} />
              <SidebarItem icon={<ArrowRightLeft size={16} />} label="Conciliação" active={activeTab === 'audits'} onClick={() => setActiveTab('audits')} />
              <SidebarItem icon={<CheckCircle2 size={16} />} label="Abonos" active={activeTab === 'abono'} onClick={() => setActiveTab('abono')} />
              <SidebarItem icon={<Truck size={16} />} label="Transportadoras" active={activeTab === 'carriers'} onClick={() => setActiveTab('carriers')} />
            </SidebarGroup>
            <SidebarGroup label="Auditoria">
              <SidebarItem icon={<Database size={16} />} label="Memória de Cálculo" active={activeTab === 'memory'} onClick={() => setActiveTab('memory')} />
              <SidebarItem icon={<TrendingUp size={16} />} label="Recuperação" onClick={() => setActiveTab('dashboard')} />
              <SidebarItem icon={<CheckCircle2 size={16} />} label="Aprovações" onClick={() => showNotification("Módulo de Aprovações Financeiras")} />
            </SidebarGroup>
            <SidebarGroup label="Configurações">
              <SidebarItem icon={<Settings size={16} />} label="Parâmetros" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
              <SidebarItem icon={<Database size={16} />} label="Tabelas de Frete" active={activeTab === 'tables'} onClick={() => setActiveTab('tables')} />
              <SidebarItem icon={<FileUp size={16} />} label="Importação de Tabela" active={activeTab === 'import-tables'} onClick={() => setActiveTab('import-tables')} />
            </SidebarGroup>
          </nav>
          <div className="p-3 border-t border-slate-300 bg-slate-100 text-[10px] text-slate-500">
            <p>Versão: 2.4.0-stable</p>
            <p>© 2024 AuditLog Systems</p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 bg-[#F3F4F6]">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between bg-white p-3 border border-slate-300 rounded shadow-sm">
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <LayoutDashboard size={18} className="text-blue-800" /> PAINEL DE CONTROLE EXECUTIVO
                  </h2>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Período:</span>
                    <button className="bg-slate-100 border border-slate-300 px-2 py-1 rounded flex items-center gap-1" onClick={() => showNotification("Alterar período")}>
                      Últimos 30 dias <ChevronDown size={12} />
                    </button>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <ClassicStatCard title="CT-es PROCESSADOS" value={stats?.total_audited.count || 0} icon={<FileText className="text-blue-700" />} color="border-l-blue-700" />
                  <ClassicStatCard title="DIVERGÊNCIAS" value={stats?.total_divergences.count || 0} icon={<AlertTriangle className="text-amber-600" />} color="border-l-amber-600" />
                  <ClassicStatCard title="VALOR RECUPERADO" value={`R$ ${(stats?.recovered_value.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<TrendingUp className="text-emerald-700" />} color="border-l-emerald-700" />
                  <ClassicStatCard title="TAXA DE ERRO" value="5.8%" icon={<ShieldCheck className="text-purple-700" />} color="border-l-purple-700" />
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 bg-white p-4 border border-slate-300 rounded shadow-sm min-h-[320px] flex flex-col">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Evolução Mensal de Auditoria</h3>
                      <Filter size={14} className="text-slate-400 cursor-pointer" onClick={() => showNotification("Filtros de Gráfico")} />
                    </div>
                    <div className="flex-grow w-full">
                      {stats && stats.recent_audits && stats.recent_audits.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                          <BarChart data={stats.recent_audits.map(a => ({ name: a.xml_key.slice(-5), valor: a.total_value }))}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                            <YAxis axisLine={{ stroke: '#cbd5e1' }} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                            <Tooltip 
                              contentStyle={{ fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            />
                            <Bar dataKey="valor" fill="#1e3a8a" radius={[2, 2, 0, 0]} barSize={30} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">
                          Aguardando dados para o gráfico...
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-white p-4 border border-slate-300 rounded shadow-sm min-h-[320px] flex flex-col">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Divergências por Tipo</h3>
                    </div>
                    <div className="flex-grow w-full flex items-center justify-center">
                      {stats && stats.recent_audits && stats.recent_audits.some(a => a.divergence_type) ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                          <PieChart>
                            <Pie
                              data={stats.recent_audits.filter(a => a.divergence_type).reduce((acc: any[], curr) => {
                                const existing = acc.find(i => i.name === curr.divergence_type);
                                if (existing) existing.value++;
                                else acc.push({ name: curr.divergence_type, value: 1 });
                                return acc;
                              }, [])}
                              innerRadius={50}
                              outerRadius={70}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {stats.recent_audits.filter(a => a.divergence_type).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">
                          Sem divergências registradas.
                        </div>
                      )}
                    </div>
                    <div className="mt-4 space-y-1">
                      {(stats?.recent_audits || []).filter(a => a.divergence_type).reduce((acc: any[], curr) => {
                        const existing = acc.find(i => i.name === curr.divergence_type);
                        if (existing) existing.value++;
                        else acc.push({ name: curr.divergence_type, value: 1 });
                        return acc;
                      }, []).map((item, i) => (
                        <div key={item.name} className="flex items-center justify-between text-[10px]">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                            <span className="text-slate-600 uppercase">{item.name}</span>
                          </div>
                          <span className="font-bold">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recent Audits Table */}
                <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
                  <div className="bg-slate-100 p-2 border-b border-slate-300 flex justify-between items-center">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Últimas Ocorrências</h3>
                    <div className="flex gap-1">
                      <button className="p-1 hover:bg-slate-200 rounded text-slate-600" onClick={() => refreshData()}><RefreshCw size={12} /></button>
                      <button className="p-1 hover:bg-slate-200 rounded text-slate-600" onClick={() => showNotification("Exportando...")}><Download size={12} /></button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[#F8FAFC] text-slate-600 text-[10px] uppercase font-bold border-b border-slate-300">
                        <tr>
                          <th className="px-3 py-2 border-r border-slate-200">Chave de Acesso</th>
                          <th className="px-3 py-2 border-r border-slate-200">Vlr. Cobrado</th>
                          <th className="px-3 py-2 border-r border-slate-200">Vlr. Auditado</th>
                          <th className="px-3 py-2 border-r border-slate-200">Diferença</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-200">
                        {audits.slice(0, 8).map((audit, idx) => (
                          <tr key={audit.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="px-3 py-2 font-mono text-slate-500 border-r border-slate-200">
                              {audit.xml_key.slice(0, 20)}...
                            </td>
                            <td className="px-3 py-2 font-semibold border-r border-slate-200">
                              {audit.charged_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="px-3 py-2 text-slate-600 border-r border-slate-200">
                              {audit.calculated_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className={`px-3 py-2 font-bold border-r border-slate-200 ${audit.difference > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                              {audit.difference.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-start gap-2">
                                {audit.status === 'contested' ? (
                                  <>
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" title="Contestado"></div>
                                    <span className="text-[10px] font-semibold text-slate-600">Contestado</span>
                                  </>
                                ) : Math.abs(audit.difference) < 0.01 ? (
                                  <>
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Conciliado"></div>
                                    <span className="text-[10px] font-semibold text-slate-600">Conciliado</span>
                                  </>
                                ) : (
                                  <>
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" title="Erro na Tarifa"></div>
                                    <span className="text-[10px] font-semibold text-slate-600">Erro na Tarifa</span>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'upload' && (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto"
              >
                <div className="bg-white border border-slate-300 rounded shadow-md overflow-hidden">
                  <div className="bg-[#1E3A8A] text-white p-3 flex items-center gap-2">
                    <FileUp size={18} />
                    <h2 className="text-sm font-bold uppercase tracking-wider">Módulo de Importação de XML (CT-e)</h2>
                  </div>
                  
                  <div className="p-8 space-y-6">
                    <div className="bg-slate-50 border border-slate-200 p-6 rounded text-center space-y-4">
                      <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto border border-blue-100">
                        <FileText className="text-blue-800" size={32} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">Selecione os arquivos XML para auditoria</p>
                        <p className="text-xs text-slate-500 mt-1">O sistema processará automaticamente as tags de valores e pesos.</p>
                      </div>
                      
                      <div className="flex flex-col items-center gap-4">
                        <FileUploadButton className="px-6 py-2 bg-[#1E3A8A] text-white rounded font-bold text-xs hover:bg-blue-900 transition-colors shadow flex items-center gap-2 disabled:opacity-50">
                          {isUploading ? <RefreshCw size={14} className="animate-spin" /> : <FileUp size={14} />}
                          {isUploading ? 'PROCESSANDO...' : 'SELECIONAR ARQUIVO'}
                        </FileUploadButton>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Arraste e solte arquivos .XML ou .ZIP</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="p-3 border border-slate-200 rounded bg-slate-50">
                        <p className="font-bold text-slate-600 mb-1 uppercase tracking-tighter">Configurações de Importação</p>
                        <label className="flex items-center gap-2 mt-2">
                          <input type="checkbox" defaultChecked /> <span>Auditar automaticamente após upload</span>
                        </label>
                        <label className="flex items-center gap-2 mt-1">
                          <input type="checkbox" defaultChecked /> <span>Validar Schema XML (SEFAZ)</span>
                        </label>
                      </div>
                      <div className="p-3 border border-slate-200 rounded bg-slate-50">
                        <p className="font-bold text-slate-600 mb-1 uppercase tracking-tighter">Destino dos Dados</p>
                        <p className="text-slate-500">Tenant: <span className="font-bold">Logística S.A.</span></p>
                        <p className="text-slate-500">Ambiente: <span className="font-bold text-emerald-600">Produção</span></p>
                      </div>
                    </div>
                  </div>

                  {uploadSuccess && (
                    <div className="bg-emerald-600 text-white p-2 text-center text-[10px] font-bold uppercase tracking-widest">
                      Importação concluída com sucesso. Dados integrados ao módulo de auditoria.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'audits' && (
              <motion.div 
                key="audits"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="bg-white p-3 border border-slate-300 rounded shadow-sm flex justify-between items-center">
                  <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <ArrowRightLeft size={18} className="text-blue-800" /> Relatório de Conciliação de Fretes
                  </h2>
                  <div className="flex gap-2">
                    <button className="bg-slate-100 border border-slate-300 px-3 py-1 text-[10px] font-bold uppercase flex items-center gap-1" onClick={() => setIsFilterModalOpen(true)}>
                      <Filter size={12} /> Filtros Avançados
                    </button>
                    <button className="bg-emerald-700 text-white px-3 py-1 text-[10px] font-bold uppercase flex items-center gap-1 shadow" onClick={handleExportXLS}>
                      <Download size={12} /> Exportar XLS
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold border-b border-slate-300">
                      <tr>
                        <th className="px-3 py-2 border-r border-slate-200">Data Aud.</th>
                        <th className="px-3 py-2 border-r border-slate-200">Chave CT-e</th>
                        <th className="px-3 py-2 border-r border-slate-200">Rota (Origem/Destino)</th>
                        <th className="px-3 py-2 border-r border-slate-200">Peso (kg)</th>
                        <th className="px-3 py-2 border-r border-slate-200">Vlr. Cobrado</th>
                        <th className="px-3 py-2 border-r border-slate-200">Vlr. Calculado</th>
                        <th className="px-3 py-2 border-r border-slate-200">Diferença</th>
                        <th className="px-3 py-2 border-r border-slate-200">Status</th>
                        <th className="px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-slate-200">
                      {audits.map((audit, idx) => (
                        <tr 
                          key={audit.id} 
                          className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 cursor-pointer transition-colors`}
                          onDoubleClick={() => handleViewCte(audit.cte_id)}
                        >
                          <td className="px-3 py-2 border-r border-slate-200">
                            {new Date(audit.audit_date).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500 border-r border-slate-200">
                            {audit.xml_key.slice(-15)}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200">
                            <div className="flex flex-col">
                              <span className="font-bold text-[9px]">{audit.origin_city || 'N/A'}</span>
                              <span className="text-slate-400 text-[8px]">PARA</span>
                              <span className="font-bold text-[9px]">{audit.dest_city || 'N/A'}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200">
                            {audit.weight.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 font-semibold border-r border-slate-200">
                            {audit.charged_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="px-3 py-2 text-slate-600 border-r border-slate-200">
                            {audit.calculated_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className={`px-3 py-2 font-bold border-r border-slate-200 ${audit.difference > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                            {audit.difference.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200">
                            <div className="flex items-center justify-start gap-2">
                              {audit.status === 'contested' ? (
                                <>
                                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" title="Contestado"></div>
                                  <span className="text-[10px] font-semibold text-slate-600">Contestado</span>
                                </>
                              ) : Math.abs(audit.difference) < 0.01 ? (
                                <>
                                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Conciliado"></div>
                                  <span className="text-[10px] font-semibold text-slate-600">Conciliado</span>
                                </>
                              ) : (
                                <>
                                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" title="Erro na Tarifa"></div>
                                  <span className="text-[10px] font-semibold text-slate-600">Erro na Tarifa</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 flex gap-1">
                            <button className="p-1 hover:bg-blue-50 text-blue-800 border border-transparent hover:border-blue-200 rounded" title="Ver Detalhes" onClick={() => handleViewCte(audit.cte_id)}>
                              <FileText size={14} />
                            </button>
                            <button className="p-1 hover:bg-amber-50 text-amber-700 border border-transparent hover:border-amber-200 rounded" title="Contestar" onClick={() => handleContest(audit.id)}>
                              <AlertTriangle size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'carriers' && (
              <motion.div key="carriers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white p-3 border border-slate-300 rounded shadow-sm flex justify-between items-center">
                  <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <Truck size={18} className="text-blue-800" /> Cadastro de Transportadoras
                  </h2>
                  <button className="bg-blue-800 text-white px-3 py-1 text-[10px] font-bold uppercase shadow" onClick={openNewCarrier}>Nova Transportadora</button>
                </div>
                <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Razão Social</th>
                        <th>CNPJ</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {carriers.map(c => (
                        <tr key={c.id}>
                          <td>{c.id}</td>
                          <td>{c.name}</td>
                          <td>{c.cnpj}</td>
                          <td>
                            <button className="text-blue-800 hover:underline" onClick={() => openEditCarrier(c)}>Editar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'tables' && (
              <motion.div key="tables" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white p-3 border border-slate-300 rounded shadow-sm flex justify-between items-center">
                  <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <Database size={18} className="text-blue-800" /> Tabelas de Frete Vigentes
                  </h2>
                  <button className="bg-blue-800 text-white px-3 py-1 text-[10px] font-bold uppercase shadow" onClick={() => showNotification("Nova Tabela")}>Nova Tabela</button>
                </div>
                <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
                  <table>
                    <thead>
                      <tr>
                        <th>Transportadora</th>
                        <th>Nome da Tabela</th>
                        <th>Versão</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables.map(t => (
                        <tr key={t.id}>
                          <td>{t.carrier_name}</td>
                          <td>{t.name}</td>
                          <td>{t.version}</td>
                          <td><span className="text-emerald-600 font-bold">ATIVO</span></td>
                          <td>
                            <button className="text-blue-800 hover:underline" onClick={() => showNotification(`Visualizando ${t.name}`)}>Visualizar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'import-tables' && (
              <motion.div key="import-tables" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white p-3 border border-slate-300 rounded shadow-sm flex justify-between items-center">
                  <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <FileUp size={18} className="text-blue-800" /> Importação de Tabelas
                  </h2>
                  <div className="flex gap-2">
                    <button 
                      className="bg-slate-100 border border-slate-300 px-3 py-1 text-[10px] font-bold uppercase flex items-center gap-1 hover:bg-slate-200 text-slate-700" 
                      onClick={handleDownloadTemplate}
                    >
                      <FileText size={12} /> Modelo Excel
                    </button>
                    <button 
                      className="bg-slate-100 border border-slate-300 px-3 py-1 text-[10px] font-bold uppercase flex items-center gap-1 hover:bg-slate-200 text-slate-700" 
                      onClick={() => showNotification("Funcionalidade de cadastro manual em desenvolvimento.")}
                    >
                      Nova Tabela Manual
                    </button>
                    
                    <button 
                      className="bg-emerald-600 text-white px-3 py-1 text-[10px] font-bold uppercase shadow flex items-center gap-1 hover:bg-emerald-700"
                      onClick={() => excelInputRef.current?.click()}
                    >
                      <FileText size={12} /> Importar Excel
                    </button>
                    <input 
                      type="file" 
                      accept=".xlsx,.xls,.csv" 
                      className="hidden" 
                      ref={excelInputRef}
                      onChange={handleTableImportUpload} 
                    />

                    <button 
                      className="bg-blue-800 text-white px-3 py-1 text-[10px] font-bold uppercase shadow flex items-center gap-1 hover:bg-blue-900"
                      onClick={() => batchInputRef.current?.click()}
                    >
                      <Database size={12} /> Importar Lote
                    </button>
                    <input 
                      type="file" 
                      accept=".xlsx,.xls,.csv,.zip" 
                      multiple 
                      className="hidden" 
                      ref={batchInputRef}
                      onChange={handleTableImportUpload} 
                    />
                  </div>
                </div>

                <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold border-b border-slate-300">
                        <tr>
                          <th className="px-2 py-2 w-8 text-center">Status</th>
                          <th className="px-3 py-2 border-r border-slate-200">Data Importação</th>
                          <th className="px-3 py-2 border-r border-slate-200">Arquivo</th>
                          <th className="px-3 py-2 border-r border-slate-200">Usuário</th>
                          <th className="px-3 py-2 border-r border-slate-200">Data Validação</th>
                          <th className="px-3 py-2 border-r border-slate-200">Data Processamento</th>
                          <th className="px-3 py-2 text-center border-r border-slate-200">Qtd Importados</th>
                          <th className="px-3 py-2 text-center border-r border-slate-200">Qtd Erros</th>
                          <th className="px-3 py-2 text-center">Qtd Total</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-200">
                        {tableImports.map((item) => (
                          <tr 
                            key={item.id} 
                            className="hover:bg-slate-50 cursor-pointer" 
                            onDoubleClick={() => handleViewErrors(item.id)}
                            title="Clique duas vezes para ver detalhes"
                          >
                            <td className="px-2 py-1.5 text-center">
                              <div className={`w-2.5 h-2.5 rounded-full mx-auto ${
                                item.status === 'success' ? 'bg-emerald-500' : 
                                item.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                              }`} title={item.status}></div>
                            </td>
                            <td className="px-3 py-1.5 border-r border-slate-200">{new Date(item.import_date).toLocaleString('pt-BR')}</td>
                            <td className="px-3 py-1.5 border-r border-slate-200 font-semibold text-blue-800">{item.filename}</td>
                            <td className="px-3 py-1.5 border-r border-slate-200">{item.user}</td>
                            <td className="px-3 py-1.5 border-r border-slate-200">{item.validation_date ? new Date(item.validation_date).toLocaleTimeString('pt-BR') : '-'}</td>
                            <td className="px-3 py-1.5 border-r border-slate-200">{item.processing_date ? new Date(item.processing_date).toLocaleTimeString('pt-BR') : '-'}</td>
                            <td className="px-3 py-1.5 text-center border-r border-slate-200">{item.qty_imported}</td>
                            <td className="px-3 py-1.5 text-center border-r border-slate-200 font-bold text-red-600 underline decoration-dotted" onClick={(e) => { e.stopPropagation(); handleViewErrors(item.id); }}>{item.qty_errors}</td>
                            <td className="px-3 py-1.5 text-center font-bold">{item.qty_total}</td>
                          </tr>
                        ))}
                        {tableImports.length === 0 && (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-slate-400 italic">
                              Nenhum histórico de importação encontrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'abono' && (
              <motion.div key="abono" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white p-3 border border-slate-300 rounded shadow-sm flex justify-between items-center">
                  <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-blue-800" /> Gestão de Abonos
                  </h2>
                  <FileUploadButton className="bg-blue-800 text-white px-3 py-1 text-[10px] font-bold uppercase shadow flex items-center gap-1 hover:bg-blue-900">
                    <FileUp size={12} /> Importar XML
                  </FileUploadButton>
                </div>
                <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold border-b border-slate-300">
                        <tr>
                          <th className="px-3 py-2">Chave CT-e</th>
                          <th className="px-3 py-2">Transportadora</th>
                          <th className="px-3 py-2 text-right">Diferença</th>
                          <th className="px-3 py-2 text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-200">
                        {divergentAudits.map((audit) => (
                          <tr key={audit.id}>
                            <td className="px-3 py-1.5 font-mono text-slate-500">{audit.xml_key.slice(-15)}</td>
                            <td className="px-3 py-1.5">{audit.carrier_name}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-red-600">{audit.difference.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td className="px-3 py-1.5 text-center">
                              <button 
                                className="bg-emerald-600 text-white px-3 py-1 text-[10px] font-bold uppercase shadow rounded hover:bg-emerald-700"
                                onClick={() => handleWaiveAudit(audit.id)}
                              >
                                Abonar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'memory' && (
              <motion.div key="memory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-white p-3 border border-slate-300 rounded shadow-sm flex justify-between items-center">
                  <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <Database size={18} className="text-blue-800" /> Memória de Cálculo - Conciliação
                  </h2>
                  <button 
                    className="bg-red-600 text-white px-3 py-1 text-[10px] font-bold uppercase shadow hover:bg-red-700"
                    onClick={async () => {
                      await fetch('/api/memory-calculations', { method: 'DELETE' });
                      showNotification('Dados da memória de cálculo foram limpos.');
                      fetchMemoryCalculations();
                    }}
                  >
                    Limpar Dados
                  </button>
                </div>
                <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold border-b border-slate-300">
                        <tr>
                          <th className="px-2 py-2">CÓDIGO</th>
                          <th className="px-2 py-2">SOLTRANSP</th>
                          <th className="px-2 py-2">Origem</th>
                          <th className="px-2 py-2">Destino</th>
                          <th className="px-2 py-2 text-right">Frete All-In</th>
                          <th className="px-2 py-2 text-right">Calculado</th>
                          <th className="px-2 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-slate-200">
                        {memoryCalculations.map((row) => (
                          <tr key={row.id}>
                            <td className="px-2 py-1.5 font-mono text-slate-500">{row.codigo}</td>
                            <td className="px-2 py-1.5">{row.soltransp}</td>
                            <td className="px-2 py-1.5">{row.origem}</td>
                            <td className="px-2 py-1.5">{row.destino}</td>
                            <td className="px-2 py-1.5 text-right font-semibold">{row.frete_all_in.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td className="px-2 py-1.5 text-right">{row.calculated_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td className="px-2 py-1.5 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className={`w-2.5 h-2.5 rounded-full ${
                                  row.status === 'CONCILIADO' ? 'bg-emerald-500' : 'bg-red-500'
                                }`} title={row.status}></div>
                                <span className={`text-[10px] font-semibold ${ 
                                  row.status === 'CONCILIADO' ? 'text-slate-600' : 
                                  row.status === 'ERRO DE CONCILIAÇÃO' ? 'text-red-600' : 
                                  row.status === 'DIVERGENTE' ? 'text-amber-600' : 'text-slate-500' 
                                }`}>{row.status}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto">
                <div className="bg-white border border-slate-300 rounded shadow-md">
                  <div className="bg-[#1E3A8A] text-white p-3 font-bold uppercase text-xs">Parâmetros do Sistema</div>
                  <div className="p-6 space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block font-bold mb-1">Margem de Tolerância (%)</label>
                        <input type="number" defaultValue="0.5" className="w-full border p-1 rounded" />
                      </div>
                      <div>
                        <label className="block font-bold mb-1">Moeda Padrão</label>
                        <select className="w-full border p-1 rounded"><option>BRL (R$)</option></select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked />
                      <span>Notificar divergências por e-mail automaticamente</span>
                    </div>
                    <button className="bg-blue-800 text-white px-4 py-2 rounded font-bold uppercase" onClick={() => showNotification("Configurações salvas.")}>Salvar Alterações</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* CT-e Visual Viewer Modal */}
      <AnimatePresence>
        {isCteModalOpen && selectedCte && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] border border-slate-400 rounded shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="bg-[#1E3A8A] text-white px-4 py-2 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <FileText size={16} />
                  <h3 className="text-xs font-bold uppercase tracking-wider">Visualização de DACTE - CT-e nº {selectedCte.xml_key.slice(-9)}</h3>
                </div>
                <div className="flex gap-2">
                  <button className="hover:bg-blue-800 p-1 rounded flex items-center gap-1 text-[10px] font-bold uppercase" onClick={() => window.print()}>
                    <Printer size={14} /> Imprimir
                  </button>
                  <button onClick={() => setIsCteModalOpen(false)} className="hover:bg-blue-800 p-1 rounded">
                    <ChevronDown size={16} className="rotate-180" />
                  </button>
                </div>
              </div>
              
              <div className="p-8 overflow-y-auto bg-slate-50 flex justify-center">
                {/* DACTE Layout */}
                <div className="bg-white w-[800px] border-2 border-black p-4 text-[10px] font-sans shadow-lg">
                  {/* Header */}
                  <div className="grid grid-cols-12 border-b-2 border-black">
                    <div className="col-span-4 border-r-2 border-black p-2 flex flex-col items-center justify-center text-center">
                      <Truck size={32} className="mb-2" />
                      <div className="font-bold text-sm">{selectedCte.carrier_name || 'TRANSPORTADORA NÃO CADASTRADA'}</div>
                      <div className="text-[8px]">CNPJ: {selectedCte.carrier_cnpj}</div>
                    </div>
                    <div className="col-span-4 border-r-2 border-black p-2 text-center flex flex-col justify-center">
                      <div className="font-bold text-lg">DACTE</div>
                      <div className="text-[8px]">Documento Auxiliar do Conhecimento de Transporte Eletrônico</div>
                    </div>
                    <div className="col-span-4 p-2 flex flex-col justify-center">
                      <div className="font-bold">CHAVE DE ACESSO</div>
                      <div className="font-mono text-[9px] break-all">{selectedCte.xml_key}</div>
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-12 border-b-2 border-black">
                    <div className="col-span-3 border-r-2 border-black p-1">
                      <div className="font-bold text-[7px] text-slate-500">MODELO</div>
                      <div>57</div>
                    </div>
                    <div className="col-span-3 border-r-2 border-black p-1">
                      <div className="font-bold text-[7px] text-slate-500">SÉRIE</div>
                      <div>1</div>
                    </div>
                    <div className="col-span-3 border-r-2 border-black p-1">
                      <div className="font-bold text-[7px] text-slate-500">NÚMERO</div>
                      <div>{selectedCte.xml_key.slice(-9)}</div>
                    </div>
                    <div className="col-span-3 p-1">
                      <div className="font-bold text-[7px] text-slate-500">DATA DE EMISSÃO</div>
                      <div>{new Date(selectedCte.created_at).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>

                  {/* Origin/Dest */}
                  <div className="grid grid-cols-2 border-b-2 border-black">
                    <div className="border-r-2 border-black p-2">
                      <div className="font-bold text-[8px] bg-slate-100 px-1 mb-1">REMETENTE</div>
                      <div className="font-bold">{selectedCte.origin_city}</div>
                      <div>CEP: {selectedCte.origin_zip}</div>
                    </div>
                    <div className="p-2">
                      <div className="font-bold text-[8px] bg-slate-100 px-1 mb-1">DESTINATÁRIO</div>
                      <div className="font-bold">{selectedCte.dest_city}</div>
                      <div>CEP: {selectedCte.dest_zip}</div>
                    </div>
                  </div>

                  {/* Values */}
                  <div className="mt-4 border-2 border-black">
                    <div className="bg-slate-100 p-1 font-bold text-center border-b-2 border-black">COMPONENTES DO VALOR DA PRESTAÇÃO DO SERVIÇO</div>
                    <div className="grid grid-cols-4 divide-x-2 divide-black">
                      <div className="p-2">
                        <div className="font-bold text-[7px]">VALOR DO SERVIÇO</div>
                        <div className="text-sm font-bold">{selectedCte.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                      </div>
                      <div className="p-2">
                        <div className="font-bold text-[7px]">PESO BRUTO (KG)</div>
                        <div className="text-sm font-bold">{selectedCte.weight.toFixed(2)}</div>
                      </div>
                      <div className="p-2">
                        <div className="font-bold text-[7px]">BASE DE CÁLCULO ICMS</div>
                        <div>{selectedCte.icms_base?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0,00'}</div>
                      </div>
                      <div className="p-2">
                        <div className="font-bold text-[7px]">VALOR DO ICMS</div>
                        <div>{selectedCte.icms_value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0,00'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Observations */}
                  <div className="mt-4 border-2 border-black p-2 min-h-[100px]">
                    <div className="font-bold text-[8px] bg-slate-100 px-1 mb-1">OBSERVAÇÕES</div>
                    <div className="text-[9px]">
                      CFOP: {selectedCte.cfop} | ALÍQUOTA ICMS: {selectedCte.icms_rate}% <br />
                      Documento emitido para fins de auditoria de frete. <br />
                      Conciliado automaticamente pelo sistema AuditFrete TMS.
                    </div>
                  </div>

                  <div className="mt-4 text-center text-[8px] text-slate-400 italic">
                    ESTE É UM DOCUMENTO DE VISUALIZAÇÃO DO SISTEMA E NÃO POSSUI VALOR FISCAL.
                  </div>
                </div>
              </div>

              <div className="bg-slate-100 p-4 border-t border-slate-300 flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => setIsCteModalOpen(false)}
                  className="px-6 py-2 bg-slate-800 text-white font-bold uppercase text-xs rounded hover:bg-slate-900 shadow"
                >
                  Fechar Visualização
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Contestation Modal */}
      <AnimatePresence>
        {isContestModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md border border-slate-300 rounded shadow-xl overflow-hidden"
            >
              <div className="bg-amber-600 text-white px-4 py-2 flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle size={14} /> Contestar Auditoria
                </h3>
                <button onClick={() => setIsContestModalOpen(false)} className="hover:bg-amber-700 p-1 rounded">
                  <ChevronDown size={16} className="rotate-180" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-600">
                  Descreva o motivo da contestação para que a transportadora possa analisar a divergência.
                </p>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Motivo da Contestação</label>
                  <textarea 
                    required
                    value={contestReason}
                    onChange={(e) => setContestReason(e.target.value)}
                    className="w-full tms-input min-h-[100px] resize-none"
                    placeholder="Ex: Valor do pedágio cobrado indevidamente conforme tabela vigente..."
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsContestModalOpen(false)}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-600 font-bold uppercase text-xs rounded hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={submitContest}
                    disabled={!contestReason}
                    className="flex-1 px-4 py-2 bg-amber-600 text-white font-bold uppercase text-xs rounded hover:bg-amber-700 shadow disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Enviar Contestação
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Carrier Registration Modal */}
      <AnimatePresence>
        {isCarrierModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md border border-slate-300 rounded shadow-xl overflow-hidden"
            >
              <div className="bg-[#1E3A8A] text-white px-4 py-2 flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  {editingCarrierId ? 'Editar Transportadora' : 'Novo Cadastro de Transportadora'}
                </h3>
                <button onClick={() => setIsCarrierModalOpen(false)} className="hover:bg-blue-800 p-1 rounded">
                  <ChevronDown size={16} className="rotate-180" />
                </button>
              </div>
              <form onSubmit={handleCreateCarrier} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Razão Social / Nome Fantasia</label>
                  <input 
                    type="text" 
                    required
                    value={newCarrierName}
                    onChange={(e) => setNewCarrierName(e.target.value)}
                    className="w-full tms-input"
                    placeholder="Ex: TRANSPORTADORA EXEMPLO LTDA"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">CNPJ</label>
                  <input 
                    type="text" 
                    required
                    value={newCarrierCnpj}
                    onChange={(e) => setNewCarrierCnpj(e.target.value)}
                    className="w-full tms-input"
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsCarrierModalOpen(false)}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-600 font-bold uppercase text-xs rounded hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-800 text-white font-bold uppercase text-xs rounded hover:bg-blue-900 shadow"
                  >
                    Salvar Cadastro
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Status Bar (Classic TMS Style) */}
      <footer className="h-6 bg-[#1E3A8A] text-white flex items-center justify-between px-3 text-[10px] uppercase font-medium">
        <div className="flex gap-4">
          <span>CAPS</span>
          <span>NUM</span>
          <span>SCRL</span>
        </div>
        <div className="flex gap-4">
          <span className="text-emerald-400">● SISTEMA ONLINE</span>
          <span>SERVIDOR: BR-SAO-01</span>
          <span>{new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR')}</span>
        </div>
      </footer>

      {/* Error Details Modal */}
      {isErrorModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
          >
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="text-amber-500" size={20} /> Detalhes dos Erros de Importação
              </h3>
              <button onClick={() => setIsErrorModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-0 overflow-auto flex-1">
              {selectedImportErrors.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-2" />
                  <p>Nenhum erro registrado para esta importação.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold sticky top-0">
                    <tr>
                      <th className="px-4 py-3 border-b border-slate-200 w-20 text-center">Linha</th>
                      <th className="px-4 py-3 border-b border-slate-200">Mensagem de Erro</th>
                      <th className="px-4 py-3 border-b border-slate-200">Dados (JSON)</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-100">
                    {selectedImportErrors.map((err) => (
                      <tr key={err.id} className="hover:bg-red-50">
                        <td className="px-4 py-2 text-center font-mono text-slate-500">{err.row_number}</td>
                        <td className="px-4 py-2 text-red-600 font-medium">{err.error_message}</td>
                        <td className="px-4 py-2 text-xs font-mono text-slate-500 truncate max-w-xs" title={err.raw_data}>
                          {err.raw_data}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-lg flex justify-end">
              <button 
                onClick={() => setIsErrorModalOpen(false)}
                className="bg-slate-200 text-slate-700 px-4 py-2 rounded text-sm font-bold hover:bg-slate-300"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function TopNavItem({ label, active, onClick }: { label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`px-3 h-full flex items-center text-xs font-medium hover:bg-blue-800 transition-colors ${active ? 'bg-blue-800 border-b-2 border-white' : ''}`}
    >
      {label}
    </button>
  );
}

function ToolbarButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center px-2 py-1 rounded transition-all ${
        active 
          ? 'bg-slate-300 text-blue-900 shadow-inner' 
          : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
      }`}
    >
      {icon}
      <span className="text-[9px] font-bold uppercase mt-0.5">{label}</span>
    </button>
  );
}

function SidebarGroup({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
        {label}
      </div>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-4 py-1.5 text-xs font-medium transition-all border-l-4 ${
        active 
          ? 'bg-blue-50 text-blue-900 border-blue-800' 
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ClassicStatCard({ title, value, icon, color }: { title: string, value: string | number, icon: React.ReactNode, color: string }) {
  return (
    <div className={`bg-white p-3 border border-slate-300 border-l-4 ${color} rounded shadow-sm flex items-center gap-4`}>
      <div className="p-2 bg-slate-50 rounded">
        {icon}
      </div>
      <div>
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
        <h4 className="text-lg font-bold text-slate-800">{value}</h4>
      </div>
    </div>
  );
}
