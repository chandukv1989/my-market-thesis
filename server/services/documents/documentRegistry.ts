/**
 * Phase 14: Server-Side Research Document Registry
 * 
 * Tracks ingested research documents, deterministic content hashes (SHA-256),
 * security associations, epistemic statuses, and processing lifecycles.
 */

import {
  ResearchDocument,
  DocumentProcessingStatus,
  DocumentRegistryStats
} from '../../../src/types';
import { persistenceManager } from '../../persistence/persistenceManager';
import { canRead, resolveOwnerId } from '../../auth/accessPolicy';

/**
 * Phase 38.2A: content-hash deduplication is scoped per owner so one tenant's upload can never
 * resolve to (and disclose) another tenant's document.
 */
function hashKey(doc: { contentHash: string; ownerUserId?: string; userId?: string }): string {
  return `${resolveOwnerId(doc) || ''}::${doc.contentHash}`;
}

export class DocumentRegistry {
  private documents: Map<string, ResearchDocument> = new Map();
  private documentsByHash: Map<string, string> = new Map(); // ownerScopedHashKey -> documentId

  /**
   * Hydrates memory cache from the persistent repository
   */
  public async hydrateFromPersistence(): Promise<number> {
    try {
      const persisted = await persistenceManager.getDocumentRepository().getAll();
      for (const doc of persisted) {
        this.documents.set(doc.documentId, doc);
        this.documentsByHash.set(hashKey(doc), doc.documentId);
      }
      return persisted.length;
    } catch (err) {
      console.warn('[DocumentRegistry] Hydration from persistence error:', err);
      return 0;
    }
  }

  /**
   * Registers a document or detects duplicate via contentHash.
   */
  public register(doc: ResearchDocument): {
    registered: boolean;
    isDuplicate: boolean;
    document: ResearchDocument;
  } {
    // 1. Exact content hash deduplication
    const existingDocId = this.documentsByHash.get(hashKey(doc));
    if (existingDocId && this.documents.has(existingDocId)) {
      const existing = this.documents.get(existingDocId)!;
      return {
        registered: false,
        isDuplicate: true,
        document: existing
      };
    }

    // 2. Store document in memory
    this.documents.set(doc.documentId, doc);
    this.documentsByHash.set(hashKey(doc), doc.documentId);

    // 3. Persist asynchronously
    persistenceManager.getDocumentRepository().save(doc).catch(err => {
      console.warn('[DocumentRegistry] Failed to persist document:', err);
    });

    return {
      registered: true,
      isDuplicate: false,
      document: doc
    };
  }

  /**
   * Retrieves document by ID.
   */
  public getDocument(documentId: string): ResearchDocument | undefined {
    return this.documents.get(documentId);
  }

  /**
   * Retrieves document by content hash.
   */
  public getDocumentByHash(contentHash: string, ownerUserId?: string): ResearchDocument | undefined {
    const docId = this.documentsByHash.get(`${ownerUserId || ''}::${contentHash}`);
    return docId ? this.documents.get(docId) : undefined;
  }

  /**
   * Lists documents associated with a specific security, optionally filtered by user ownership.
   */
  public getDocumentsBySecurity(securityId?: string, userId?: string): ResearchDocument[] {
    // Phase 38.2A: fail-closed. Owner match or explicit SHARED only; ownerless legacy docs are never listed.
    let docs = Array.from(this.documents.values()).filter(d => canRead(d as any, userId));
    if (!securityId) {
      return docs.filter(d => !d.securityId);
    }
    const target = securityId.toLowerCase();
    return docs.filter(d =>
      d.securityId?.toLowerCase() === target ||
      d.securityId?.toLowerCase() === `sec-${target}` ||
      d.securityId?.toLowerCase().replace(/^sec-/, '') === target
    );
  }

  /**
   * Lists all registered documents, optionally scoped to a user.
   */
  public getAllDocuments(userId?: string): ResearchDocument[] {
    // Phase 38.2A: fail-closed. Owner match or explicit SHARED only; ownerless legacy docs are never listed.
    return Array.from(this.documents.values()).filter(d => canRead(d as any, userId));
  }

  /**
   * INTERNAL (system/maintenance/tests only): every registered document regardless of owner.
   * Must never back an HTTP response.
   */
  public getAllDocumentsUnscopedInternal(): ResearchDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Updates document processing status and optional extraction warnings.
   */
  public updateStatus(
    documentId: string,
    status: DocumentProcessingStatus,
    warnings?: string[]
  ): boolean {
    const doc = this.documents.get(documentId);
    if (!doc) return false;

    doc.processingStatus = status;
    if (warnings && warnings.length > 0) {
      doc.extractionWarnings = [...(doc.extractionWarnings || []), ...warnings];
    }
    return true;
  }

  /**
   * Records generated evidence IDs and chunk IDs on the document record.
   */
  public updateEvidenceAndChunks(
    documentId: string,
    evidenceIds: string[],
    chunkIds: string[]
  ): boolean {
    const doc = this.documents.get(documentId);
    if (!doc) return false;

    doc.evidenceIds = evidenceIds;
    doc.chunkIds = chunkIds;
    return true;
  }

  /**
   * Deletes a document from the registry.
   */
  public deleteDocument(documentId: string): boolean {
    const doc = this.documents.get(documentId);
    if (!doc) return false;

    this.documentsByHash.delete(hashKey(doc));
    this.documents.delete(documentId);
    return true;
  }

  /**
   * Returns comprehensive registry metrics.
   */
  public getStats(userId?: string): DocumentRegistryStats {
    // Phase 38.2A: stats only ever describe documents the caller may read.
    const docs = Array.from(this.documents.values()).filter(d => canRead(d as any, userId));
    const bySec: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalEvidence = 0;
    let totalChunks = 0;
    let ready = 0;
    let failed = 0;

    for (const d of docs) {
      const secKey = d.securityId || 'GENERAL';
      bySec[secKey] = (bySec[secKey] || 0) + 1;
      byType[d.documentType] = (byType[d.documentType] || 0) + 1;

      if (d.processingStatus === 'READY') ready++;
      if (d.processingStatus === 'FAILED') failed++;

      totalEvidence += d.evidenceIds?.length || 0;
      totalChunks += d.chunkIds?.length || 0;
    }

    return {
      totalDocuments: docs.length,
      readyDocuments: ready,
      failedDocuments: failed,
      totalEvidenceItems: totalEvidence,
      totalChunks: totalChunks,
      documentsBySecurity: bySec,
      documentsByType: byType
    };
  }

  /**
   * Clear in-memory state (useful for tests).
   */
  public clear(): void {
    this.documents.clear();
    this.documentsByHash.clear();
  }
}

export const documentRegistry = new DocumentRegistry();
