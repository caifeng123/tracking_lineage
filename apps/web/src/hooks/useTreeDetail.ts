import { useState, useEffect, useCallback } from 'react';
import type { TreeDetailResponse, FileContent, DirNode } from '../types';
import { fetchTreeDetail, fetchFileTree, fetchFileContent } from '../services/api';

export function useTreeDetail(repoName: string, rawParam: string, rootId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TreeDetailResponse | null>(null);
  const [fileTree, setFileTree] = useState<DirNode | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState('');
  const [highlightLine, setHighlightLine] = useState<number | undefined>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTreeDetail(repoName, rawParam, rootId)
      .then(async (detail) => {
        if (cancelled) return;
        setData(detail);
        const treeRes = await fetchFileTree(repoName, detail.involvedFiles);
        if (!cancelled) setFileTree(treeRes.tree);
        if (detail.root.filePath) {
          loadFileInternal(detail.root.filePath, detail.root.startLine);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [repoName, rawParam, rootId]);

  async function loadFileInternal(filePath: string, line?: number) {
    setFileLoading(true);
    setSelectedFile(filePath);
    setHighlightLine(line);
    try {
      const content = await fetchFileContent(repoName, filePath);
      setFileContent(content);
    } catch {
      setFileContent(null);
    } finally {
      setFileLoading(false);
    }
  }

  const loadFile = useCallback((filePath: string, line?: number) => {
    loadFileInternal(filePath, line);
  }, [repoName]);

  return { loading, error, data, fileTree, fileContent, fileLoading, loadFile, selectedFile, highlightLine };
}
