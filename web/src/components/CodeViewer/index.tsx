import { useRef, useEffect } from 'react';
import { Spin, Typography, Empty } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { FileContent } from '../../types';

const { Text } = Typography;

interface CodeViewerProps {
  fileContent: FileContent | null;
  loading: boolean;
  highlightLine?: number;
  selectedFile: string;
}

export default function CodeViewer({ fileContent, loading, highlightLine, selectedFile }: CodeViewerProps) {
  const editorRef = useRef<any>(null);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    if (highlightLine) revealLine(editor, highlightLine);
  };

  function revealLine(editor: any, line: number) {
    editor.revealLineInCenter(line);
    editor.setSelection({
      startLineNumber: line, startColumn: 1,
      endLineNumber: line, endColumn: 1,
    });
    editor.createDecorationsCollection([{
      range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
      options: {
        isWholeLine: true,
        className: 'lineHighlight',
        glyphMarginClassName: 'lineHighlightGlyph',
      },
    }]);
  }

  useEffect(() => {
    if (editorRef.current && highlightLine) {
      setTimeout(() => revealLine(editorRef.current, highlightLine), 100);
    }
  }, [highlightLine, fileContent]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin /></div>;
  }

  if (!fileContent) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Empty description="选择调用树节点或文件以查看代码" image={<FileTextOutlined style={{ fontSize: 48, color: '#555' }} />} />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        height: 32, background: '#252526', borderBottom: '1px solid #303030',
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
      }}>
        <FileTextOutlined style={{ color: '#888', fontSize: 12 }} />
        <Text style={{ fontSize: 12, color: '#ccc' }}>{selectedFile}</Text>
        <Text type="secondary" style={{ fontSize: 11 }}>({fileContent.totalLines} 行 · {fileContent.language})</Text>
      </div>
      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          language={fileContent.language}
          value={fileContent.content}
          theme="vs-dark"
          onMount={handleEditorMount}
          options={{
            readOnly: true, minimap: { enabled: true }, fontSize: 13,
            lineNumbers: 'on', scrollBeyondLastLine: false, wordWrap: 'off',
            renderWhitespace: 'none', folding: true, glyphMargin: true, smoothScrolling: true,
          }}
        />
      </div>
      <style>{"\
        .lineHighlight { background: rgba(22, 119, 255, 0.15) !important; }\
        .lineHighlightGlyph { background: #1677ff; width: 3px !important; margin-left: 3px; }\
      "}</style>
    </div>
  );
}
