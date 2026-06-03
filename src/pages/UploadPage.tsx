import { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, X, ClipboardPaste, ChevronDown, ChevronRight, Circle } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Stage = 'idle' | 'parsing' | 'uploading' | 'extracting' | 'done' | 'error';

interface SectionStatus {
  section: string;
  status: 'success' | 'failed' | 'skipped';
  model_used: string;
  elapsed_ms: number;
  error_message?: string;
  source_mode: string;
}

interface DiagnosticData {
  issueId: string | null;
  textLength: number | null;
  extractionStartedAt: number | null;
  elapsedMs: number | null;
  httpStatus: number | null;
  modelUsed: string | null;
  usedFallback: boolean | null;
  responseDurationMs: number | null;
  validationErrors: string[];
  rawError: string | null;
  rawResponsePreview: string | null;
  logs: Array<{ timestamp: string; step: string; detail?: string }>;
  sectionStatus: SectionStatus[];
  partial: boolean;
}

const INITIAL_DIAGNOSTICS: DiagnosticData = {
  issueId: null,
  textLength: null,
  extractionStartedAt: null,
  elapsedMs: null,
  httpStatus: null,
  modelUsed: null,
  usedFallback: null,
  responseDurationMs: null,
  validationErrors: [],
  rawError: null,
  rawResponsePreview: null,
  logs: [],
  sectionStatus: [],
  partial: false,
};

const EXPECTED_SECTIONS = [
  { id: 'metadata_and_summary', label: 'Issue metadata & summary' },
  { id: 'bd_signals', label: 'BD signals' },
  { id: 'leverage_resets', label: 'Leverage resets' },
  { id: 'recommended_actions', label: 'Recommended actions' },
  { id: 'deal_structure_and_outreach', label: 'Deal structure & outreach' },
  { id: 'precedent_comps', label: 'Precedent comps' },
  { id: 'mispricing_flags', label: 'Mispricing flags' },
];

export default function UploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [fileName, setFileName] = useState('');
  const [textPreview, setTextPreview] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticData>(INITIAL_DIAGNOSTICS);
  const [diagOpen, setDiagOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (stage === 'extracting' && diagnostics.extractionStartedAt) {
      elapsedRef.current = setInterval(() => {
        setElapsed(Date.now() - diagnostics.extractionStartedAt!);
      }, 250);
    } else {
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
    }
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [stage, diagnostics.extractionStartedAt]);

  const stageLabel: Record<Stage, string> = {
    idle: '',
    parsing: 'Parsing document...',
    uploading: 'Uploading to storage...',
    extracting: `Extracting sections in parallel... ${elapsed > 0 ? `(${Math.round(elapsed / 1000)}s)` : ''}`,
    done: 'Extraction complete — redirecting to review',
    error: 'Error occurred',
  };

  const processFile = async (file: File) => {
    setErrorMsg('');
    setFileName(file.name);
    setStage('parsing');
    setDiagnostics(INITIAL_DIAGNOSTICS);

    let rawText = '';

    try {
      if (file.name.endsWith('.txt') || file.type === 'text/plain') {
        rawText = await file.text();
      } else if (file.name.endsWith('.docx')) {
        const mammoth = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        rawText = result.value;
      } else {
        setErrorMsg('Unsupported file type. Please upload a .docx or .txt file.');
        setStage('error');
        return;
      }

      if (rawText.trim().length < 50) {
        setErrorMsg('The document appears to be empty or too short to process.');
        setStage('error');
        return;
      }

      setTextPreview(rawText.slice(0, 600) + (rawText.length > 600 ? '...' : ''));
      await runExtractionPipeline(rawText, file);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse document');
      setStage('error');
    }
  };

  const runExtractionPipeline = async (rawText: string, file?: File) => {
    let issueId: string | null = null;

    try {
      setStage('uploading');
      setDiagnostics(prev => ({ ...prev, textLength: rawText.length }));

      const { data: issue, error: issueError } = await supabase
        .from('issues')
        .insert({
          user_id: user!.id,
          raw_text: rawText,
          status: 'extracting',
          title: file?.name?.replace(/\.[^/.]+$/, '') ?? 'Pasted Brief',
        })
        .select()
        .single();

      if (issueError || !issue) throw issueError ?? new Error('Failed to create issue');
      issueId = issue.id;
      setDiagnostics(prev => ({ ...prev, issueId: issue.id }));

      if (file) {
        const path = `${user!.id}/${issue.id}/${file.name}`;
        const { error: storageError } = await supabase.storage
          .from('briefs')
          .upload(path, file, { upsert: true });

        if (!storageError) {
          await supabase.from('issues').update({ storage_path: path }).eq('id', issue.id);
        }
      }

      const extractionStart = Date.now();
      setStage('extracting');
      setDiagnostics(prev => ({ ...prev, extractionStartedAt: extractionStart }));

      const { data: { session } } = await supabase.auth.getSession();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180_000);

      let response: Response;
      try {
        response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-brief`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token}`,
              Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ text: rawText, issue_id: issue.id }),
            signal: controller.signal,
          }
        );
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        const msg = fetchErr instanceof Error && fetchErr.name === 'AbortError'
          ? 'Extraction timed out after 3 minutes. Try a shorter document or paste text.'
          : (fetchErr instanceof Error ? fetchErr.message : 'Network error during extraction');

        // Frontend fallback: mark issue as error
        await supabase.from('issues').update({
          status: 'error',
          extraction_error: msg,
        }).eq('id', issue.id);

        throw new Error(msg);
      }
      clearTimeout(timeoutId);

      setDiagnostics(prev => ({
        ...prev,
        httpStatus: response.status,
        elapsedMs: Date.now() - extractionStart,
      }));

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
          validation_errors: [],
          logs: [],
        }));

        setDiagnostics(prev => ({
          ...prev,
          validationErrors: errBody.validation_errors ?? [],
          rawError: errBody.error ?? null,
          rawResponsePreview: errBody.raw_response_preview ?? null,
          modelUsed: errBody.model_used ?? null,
          usedFallback: errBody.used_fallback ?? null,
          logs: errBody.logs ?? [],
          sectionStatus: errBody.section_status ?? [],
          partial: errBody.partial ?? false,
        }));

        // Frontend fallback: mark issue as error if server didn't already
        await supabase.from('issues').update({
          status: 'error',
          extraction_error: errBody.error ?? `HTTP ${response.status}`,
        }).eq('id', issue.id);

        throw new Error(errBody.error ?? `Extraction failed with status ${response.status}`);
      }

      const result = await response.json();

      setDiagnostics(prev => ({
        ...prev,
        modelUsed: result.model_used ?? null,
        usedFallback: result.used_fallback ?? null,
        responseDurationMs: result.response_duration_ms ?? null,
        logs: result.logs ?? [],
        sectionStatus: result.section_status ?? [],
        partial: result.partial ?? false,
      }));

      if (result.error) throw new Error(result.error);
      if (!result.extraction) throw new Error('Extraction returned no data');

      // Detect fixture briefs by content signatures
      const isMay26Fixture = rawText.includes('May 26') && rawText.includes('BD Brief') && rawText.includes('Datroway');
      const isMay31Fixture = rawText.includes('May 31') && rawText.includes('BD Brief') && rawText.includes('Decnupaz');
      const isFixture = isMay26Fixture || isMay31Fixture;
      const fixtureId = isMay26Fixture ? 'may_26_2026' : isMay31Fixture ? 'may_31_2026' : undefined;
      const extraction = {
        ...result.extraction,
        _qa_mode: isFixture ? 'test_fixture' : 'production',
        ...(fixtureId ? { _fixture_id: fixtureId } : {}),
      };

      const { error: updateError } = await supabase
        .from('issues')
        .update({
          extraction_json: extraction,
          raw_extraction_json: result.raw_extraction ?? null,
          qa_warnings: result.qa_warnings ?? [],
          status: 'review',
          issue_number: extraction?.issue_metadata?.issue_number || null,
          issue_date: extraction?.issue_metadata?.issue_date || null,
          title: extraction?.issue_metadata?.title || issue.title,
          source: extraction?.issue_metadata?.source || null,
          brief_type: extraction?.issue_metadata?.brief_type || 'weekly',
        })
        .eq('id', issue.id);

      if (updateError) throw new Error(`Failed to save extraction: ${updateError.message}`);

      setStage('done');
      setTimeout(() => navigate(`/review/${issue.id}`), 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Extraction failed';
      setErrorMsg(msg);
      setDiagnostics(prev => ({ ...prev, rawError: prev.rawError || msg }));
      setStage('error');

      // Final fallback: if we have an issue ID and it might be stuck, mark error
      if (issueId) {
        await supabase.from('issues').update({
          status: 'error',
          extraction_error: msg,
        }).eq('id', issueId).eq('status', 'extracting');
      }
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handlePasteSubmit = () => {
    if (pastedText.trim().length < 50) {
      setErrorMsg('Please paste at least 50 characters of brief text.');
      return;
    }
    setTextPreview(pastedText.slice(0, 600) + (pastedText.length > 600 ? '...' : ''));
    setFileName('Pasted text');
    runExtractionPipeline(pastedText);
  };

  const isProcessing = ['parsing', 'uploading', 'extracting'].includes(stage);
  const showDiagnostics = stage !== 'idle' && (diagnostics.issueId || diagnostics.textLength || diagnostics.logs.length > 0 || diagnostics.rawError);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Upload Brief"
        subtitle="Upload a DOCX or TXT file, or paste brief text to begin AI extraction"
      />

      <div className="flex-1 p-6 max-w-3xl">
        {stage !== 'idle' && (
          <div className={`flex items-center gap-3 mb-6 px-4 py-3 rounded-lg border ${
            stage === 'error'
              ? 'bg-red-900/20 border-red-800 text-red-300'
              : stage === 'done'
              ? 'bg-emerald-900/20 border-emerald-800 text-emerald-300'
              : 'bg-sky-900/20 border-sky-800 text-sky-300'
          }`}>
            {isProcessing && <Loader2 size={16} className="animate-spin shrink-0" />}
            {stage === 'done' && <CheckCircle2 size={16} className="shrink-0" />}
            {stage === 'error' && <AlertCircle size={16} className="shrink-0" />}
            <span className="text-sm font-medium">{stageLabel[stage]}</span>
            {stage === 'error' && errorMsg && (
              <span className="text-sm opacity-80 ml-1">— {errorMsg}</span>
            )}
          </div>
        )}

        {(stage === 'extracting' || diagnostics.sectionStatus.length > 0) && (
          <div className="mb-6 bg-slate-900/60 border border-slate-700 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              Section extraction
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {EXPECTED_SECTIONS.map((section) => {
                const result = diagnostics.sectionStatus.find(s => s.section === section.id);
                const isRunning = stage === 'extracting' && !result;
                return (
                  <div key={section.id} className="flex items-center gap-2 py-1 px-2 rounded">
                    {isRunning && <Loader2 size={12} className="animate-spin text-sky-400 shrink-0" />}
                    {result?.status === 'success' && <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />}
                    {result?.status === 'failed' && <AlertCircle size={12} className="text-red-400 shrink-0" />}
                    {result?.status === 'skipped' && <Circle size={12} className="text-slate-600 shrink-0" />}
                    {!isRunning && !result && <Circle size={12} className="text-slate-600 shrink-0" />}
                    <span className={`text-xs ${
                      result?.status === 'success' ? 'text-slate-200' :
                      result?.status === 'failed' ? 'text-red-300' :
                      isRunning ? 'text-sky-300' : 'text-slate-500'
                    }`}>
                      {section.label}
                    </span>
                    {result?.elapsed_ms && (
                      <span className="text-[10px] text-slate-600 ml-auto">{(result.elapsed_ms / 1000).toFixed(1)}s</span>
                    )}
                    {result?.model_used && result.model_used !== 'none' && (
                      <span className="text-[10px] text-slate-600">{result.model_used.replace('claude-', '').split('-')[0]}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {diagnostics.partial && stage === 'done' && (
              <p className="mt-3 text-xs text-amber-400">
                Some sections failed but extraction proceeded with available data.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-5">
          <button
            onClick={() => { setPasteMode(false); setErrorMsg(''); setStage('idle'); }}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              !pasteMode
                ? 'bg-sky-600/20 border-sky-600 text-sky-300'
                : 'bg-transparent border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <Upload size={14} />
            Upload File
          </button>
          <button
            onClick={() => { setPasteMode(true); setErrorMsg(''); setStage('idle'); }}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              pasteMode
                ? 'bg-sky-600/20 border-sky-600 text-sky-300'
                : 'bg-transparent border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <ClipboardPaste size={14} />
            Paste Text
          </button>
        </div>

        {!pasteMode && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-sky-500 bg-sky-900/10'
                : isProcessing
                ? 'border-slate-700 bg-slate-900/20 cursor-not-allowed'
                : 'border-slate-700 hover:border-slate-500 bg-slate-900/20 hover:bg-slate-800/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.txt"
              onChange={handleFileChange}
              className="hidden"
              disabled={isProcessing}
            />
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center">
                <FileText size={22} className="text-slate-400" />
              </div>
              <div>
                <p className="text-slate-200 font-medium text-sm">
                  {fileName ? fileName : 'Drop a file here or click to browse'}
                </p>
                <p className="text-slate-500 text-xs mt-1">DOCX and TXT files supported</p>
              </div>
            </div>
          </div>
        )}

        {pasteMode && (
          <div className="space-y-3">
            <textarea
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              disabled={isProcessing}
              placeholder="Paste the full brief text here..."
              rows={14}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600 resize-none font-mono"
            />
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-xs">{pastedText.length} characters</span>
              <button
                onClick={handlePasteSubmit}
                disabled={isProcessing || pastedText.trim().length < 50}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isProcessing && <Loader2 size={14} className="animate-spin" />}
                Extract Brief
              </button>
            </div>
          </div>
        )}

        {textPreview && !pasteMode && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Extracted text preview</span>
              <button onClick={() => setTextPreview('')} className="text-slate-500 hover:text-slate-300">
                <X size={14} />
              </button>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-400 text-xs font-mono leading-relaxed max-h-40 overflow-y-auto">
              {textPreview}
            </div>
          </div>
        )}

        {stage === 'error' && (
          <button
            onClick={() => { setStage('idle'); setErrorMsg(''); setFileName(''); setTextPreview(''); setDiagnostics(INITIAL_DIAGNOSTICS); }}
            className="mt-4 text-sm text-sky-400 hover:text-sky-300 transition-colors"
          >
            Try again
          </button>
        )}

        {showDiagnostics && (
          <div className="mt-6 border border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setDiagOpen(!diagOpen)}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 text-slate-400 text-xs font-medium transition-colors"
            >
              {diagOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Diagnostics
              {diagnostics.httpStatus && (
                <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  diagnostics.httpStatus === 200 ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'
                }`}>
                  HTTP {diagnostics.httpStatus}
                </span>
              )}
            </button>

            {diagOpen && (
              <div className="px-4 py-3 bg-slate-900/50 border-t border-slate-700 space-y-2 text-xs font-mono text-slate-400">
                <DiagRow label="Issue ID" value={diagnostics.issueId} />
                <DiagRow label="Text length" value={diagnostics.textLength ? `${diagnostics.textLength} chars` : null} />
                <DiagRow label="Current step" value={stage} />
                <DiagRow label="Elapsed" value={diagnostics.elapsedMs ? `${(diagnostics.elapsedMs / 1000).toFixed(1)}s` : (elapsed > 0 ? `${(elapsed / 1000).toFixed(1)}s (running)` : null)} />
                <DiagRow label="Model used" value={diagnostics.modelUsed} />
                <DiagRow label="Used fallback" value={diagnostics.usedFallback !== null ? String(diagnostics.usedFallback) : null} />
                <DiagRow label="API duration" value={diagnostics.responseDurationMs ? `${(diagnostics.responseDurationMs / 1000).toFixed(1)}s` : null} />
                <DiagRow label="HTTP status" value={diagnostics.httpStatus ? String(diagnostics.httpStatus) : null} />

                {diagnostics.validationErrors.length > 0 && (
                  <div className="pt-1">
                    <span className="text-red-400 font-semibold">Validation errors:</span>
                    <ul className="mt-1 space-y-0.5 pl-3">
                      {diagnostics.validationErrors.map((e, i) => (
                        <li key={i} className="text-red-300">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {diagnostics.rawError && (
                  <div className="pt-1">
                    <span className="text-red-400 font-semibold">Error:</span>
                    <pre className="mt-1 text-red-300 whitespace-pre-wrap break-all">{diagnostics.rawError}</pre>
                  </div>
                )}

                {diagnostics.rawResponsePreview && (
                  <div className="pt-1">
                    <span className="text-amber-400 font-semibold">Raw response preview:</span>
                    <pre className="mt-1 text-slate-500 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{diagnostics.rawResponsePreview}</pre>
                  </div>
                )}

                {diagnostics.logs.length > 0 && (
                  <div className="pt-1">
                    <span className="text-slate-300 font-semibold">Server logs:</span>
                    <div className="mt-1 max-h-48 overflow-y-auto space-y-0.5">
                      {diagnostics.logs.map((l, i) => (
                        <div key={i} className="flex gap-2">
                          <span className="text-slate-600 shrink-0">{l.timestamp.split('T')[1]?.slice(0, 12)}</span>
                          <span className="text-sky-400">{l.step}</span>
                          {l.detail && <span className="text-slate-500 break-all">{l.detail}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DiagRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="text-slate-500 shrink-0 w-28">{label}:</span>
      <span className="text-slate-300 break-all">{value}</span>
    </div>
  );
}
