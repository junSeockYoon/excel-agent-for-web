import { useRef, useState } from 'react';

export default function UploadDropzone({ onUpload, disabled }) {
  const inputRef = useRef(null);
  const [active, setActive] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleFiles(files) {
    const file = files?.[0];
    if (!file || disabled) return;
    try {
      await onUpload(file);
      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 700);
    } catch {
      /* parent shows error */
    }
  }

  return (
    <div
      className={`dropzone${active ? ' is-active' : ''}${success ? ' is-success' : ''}`}
      onDragEnter={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <h2>파일을 놓거나 클릭해서 선택</h2>
      <p>.xlsx · .xls · .csv · 최대 10MB</p>
      <p className="hint">여러 시트가 있으면 탭으로 바꾸고, 챗에서 시트별로 물을 수 있습니다.</p>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
