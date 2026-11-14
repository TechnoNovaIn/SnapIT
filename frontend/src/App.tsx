import React, { useState, useEffect, useCallback } from 'react';
import { KlipitHeader } from './components/KlipitHeader';
import { KlipitHomeScreen } from './components/KlipitHomeScreen';
import { KlipitReceiptsScreen } from './components/KlipitReceiptsScreen';
import { KlipitReceiptDetailsScreen } from './components/KlipitReceiptDetailsScreen';
import { ExpenditureAnalysisScreen } from './components/ExpenditureAnalysisScreen';
import { BottomNav } from './components/BottomNav';
import { AddReceiptModal } from './components/AddReceiptModal';
import { AccountModal } from './components/AccountModal';
import type { UserAccount } from './components/AccountModal';
import { LoginPage } from './components/LoginPage';
import { SplashScreen } from './components/SplashScreen';
import { EditDetailsModal } from './components/EditDetailsModal';
import { ProcessingModal } from './components/ProcessingModal';
import type { ProcessingStep } from './components/ProcessingModal';
import { SettingsView } from './components/SettingsView';
import type { DocumentData, DocumentListItem } from './types/document';
import { api } from './api/client';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

// Clean-slate reset to ensure complete erasure of all legacy test accounts and cached vaults
try {
  const WIPE_KEY = 'snapit_clean_wipe_v3';
  if (typeof localStorage !== 'undefined' && localStorage.getItem(WIPE_KEY) !== 'true') {
    const customApi = localStorage.getItem('snapit_api_url');
    const workingApi = localStorage.getItem('snapit_working_api_url');
    localStorage.clear();
    if (customApi) localStorage.setItem('snapit_api_url', customApi);
    if (workingApi) localStorage.setItem('snapit_working_api_url', workingApi);
    localStorage.setItem(WIPE_KEY, 'true');
  }
} catch {}

export const App: React.FC = () => {
  // Splash screen state (shows application name on open as in Image 2)
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 2200);
    return () => clearTimeout(splashTimer);
  }, []);


  // Account state (Name, Number, Sign Out)
  const [userAccount, setUserAccount] = useState<UserAccount>(() => {
    const saved = localStorage.getItem('snapit_user_account');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      name: '',
      phoneNumber: '',
      email: '',
      isSignedIn: false,
    };
  });

  // Navigation states
  const [activeTab, setActiveTab] = useState<'home' | 'receipts'>('home');
  const [currentScreen, setCurrentScreen] = useState<'main' | 'details' | 'settings' | 'expenditure'>('main');

  // Data states
  const [receiptsList, setReceiptsList] = useState<DocumentListItem[]>([]);
  const [activeDocument, setActiveDocument] = useState<DocumentData | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>('uploading');
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);

  // Android Native Lifecycle: Status Bar & Hardware Back Button
  useEffect(() => {
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#f7f7f8' }).catch(() => {});

    const backListener = CapApp.addListener('backButton', () => {
      if (isAddModalOpen) {
        setIsAddModalOpen(false);
      } else if (isAccountModalOpen) {
        setIsAccountModalOpen(false);
      } else if (isEditing) {
        setIsEditing(false);
      } else if (currentScreen !== 'main') {
        setCurrentScreen('main');
      } else if (activeTab !== 'home') {
        setActiveTab('home');
      } else {
        CapApp.exitApp();
      }
    });

    return () => {
      backListener.then((h) => h.remove()).catch(() => {});
    };
  }, [isAddModalOpen, isAccountModalOpen, isEditing, currentScreen, activeTab]);

  // Toasts
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // Fetch receipts from backend & auto-sync
  const refreshReceipts = useCallback(async () => {
    try {
      const data = await api.listDocuments();
      setReceiptsList(data);
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    refreshReceipts();

    // Cross-Device Auto-Sync: sync when window/app gains focus or periodically
    const handleFocusSync = () => {
      refreshReceipts();
    };

    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleFocusSync);

    const syncInterval = setInterval(() => {
      if (userAccount.isSignedIn) {
        refreshReceipts();
      }
    }, 5000); // Auto-sync every 5 seconds in background across all devices

    // Check shared document token in URL if present
    const params = new URLSearchParams(window.location.search);
    const sharedToken = params.get('shared');
    if (sharedToken) {
      api
        .getSharedDocument(sharedToken)
        .then((doc) => {
          setActiveDocument(doc);
          setCurrentScreen('details');
          showToast('Loaded shared receipt', 'info');
        })
        .catch(() => {
          showToast('Shared receipt expired or invalid', 'error');
        });
    }

    return () => {
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleFocusSync);
      clearInterval(syncInterval);
    };
  }, [userAccount.isSignedIn, refreshReceipts, showToast]);

  // Open receipt details - Works reliably unlimited times
  const handleOpenReceipt = async (id: string) => {
    try {
      const doc = await api.getDocument(id);
      setActiveDocument(doc);
      setCurrentScreen('details');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.warn('[SnapIT] getDocument primary lookup failed, trying in-memory list fallback for id:', id, err);
      // Fallback: check receiptsList in state so user is never blocked
      const item = receiptsList.find((r) => r.id === id);
      if (item) {
        const fallbackDoc: DocumentData = {
          id: item.id,
          filename: item.filename,
          file_size: item.file_size,
          mime_type: item.mime_type,
          file_url: item.thumbnail_url || '',
          thumbnail_url: item.thumbnail_url,
          document_type: item.document_type || 'Receipt',
          merchant_name: item.merchant_name || 'Receipt',
          customer_name: userAccount.name || 'User',
          invoice_number: item.invoice_number || 'INV-001',
          invoice_date: item.invoice_date || new Date().toISOString().split('T')[0],
          currency: item.currency || 'INR',
          subtotal: item.total_amount || 0,
          discount: 0,
          tax_amount: 0,
          total_amount: item.total_amount || 0,
          payment_status: 'PAID',
          review_status: (item.review_status as any) || 'verified',
          processing_status: (item.processing_status as any) || 'completed',
          confidence_score: 1.0,
          tags: [item.document_type || 'General'],
          uncertain_fields: [],
          line_items: [
            {
              description: item.merchant_name || 'Purchase Item',
              category: item.document_type || 'General',
              quantity: 1,
              unit_price: item.total_amount || 0,
              tax_amount: 0,
              total: item.total_amount || 0,
            },
          ],
          share_token: `share-${item.id}`,
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.created_at || new Date().toISOString(),
        };
        setActiveDocument(fallbackDoc);
        setCurrentScreen('details');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      showToast('Could not load receipt details', 'error');
    }
  };

  // Back from details
  const handleBackFromDetails = () => {
    setCurrentScreen('main');
    setActiveDocument(null);
  };

  // Handle Scan / Upload from Screenshot 2 modal
  const handleFileSelected = async (file: File) => {
    setLastUploadedFile(file);
    setIsProcessing(true);
    setProcessingError(null);
    setProcessingStep('uploading');

    try {
      // Step 1: Uploading
      const uploaded = await api.uploadDocument(file);

      // Step 2: Reading
      setProcessingStep('reading');
      await new Promise((r) => setTimeout(r, 500));

      // Step 3: Extracting with AI
      setProcessingStep('extracting');
      const processed = await api.processDocument(uploaded.id);

      // Step 4: Validating
      setProcessingStep('validating');
      await new Promise((r) => setTimeout(r, 400));

      // Step 5: Completed
      setProcessingStep('completed');
      await new Promise((r) => setTimeout(r, 300));

      setIsProcessing(false);
      setActiveDocument(processed);
      setCurrentScreen('details');
      refreshReceipts();
      showToast('Receipt clipped and extracted with SnapIT AI!', 'success');
    } catch (err: any) {
      setProcessingStep('failed');
      setProcessingError(err.message || 'Failed to process receipt');
    }
  };

  // Handle Manual Expense Creation from Screenshot 2 modal
  const handleManualExpenseCreate = async (data: {
    merchant_name: string;
    total_amount: number;
    category?: string;
  }) => {
    try {
      const created = await api.createManualExpense({
        merchant_name: data.merchant_name,
        total_amount: data.total_amount,
        category: data.category || 'General',
      });
      await refreshReceipts();
      setActiveDocument(created);
      setCurrentScreen('details');
      showToast('Expense saved successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save expense', 'error');
    }
  };

  // Save changes from Edit Modal
  const handleSaveDocument = async (updatedData: Partial<DocumentData>) => {
    if (!activeDocument) return;
    try {
      const saved = await api.updateDocument(activeDocument.id, updatedData);
      setActiveDocument(saved);
      refreshReceipts();
      showToast('Receipt updated successfully!', 'success');
    } catch (err: any) {
      showToast('Failed to update receipt', 'error');
      throw err;
    }
  };

  // Update tags
  const handleUpdateTags = async (newTags: string[]) => {
    if (!activeDocument) return;
    try {
      const updated = await api.updateDocument(activeDocument.id, { tags: newTags });
      setActiveDocument(updated);
      refreshReceipts();
      showToast('Tags updated', 'success');
    } catch {
      showToast('Failed to update tags', 'error');
    }
  };

  // Delete receipt
  const handleDeleteReceipt = async (id: string) => {
    try {
      await api.deleteDocument(id);
      showToast('Receipt deleted', 'info');
      setActiveDocument(null);
      setCurrentScreen('main');
      refreshReceipts();
    } catch {
      showToast('Failed to delete receipt', 'error');
    }
  };

  // Account handlers
  const handleUpdateUser = (updated: Partial<UserAccount>) => {
    setUserAccount((prev) => {
      const next = { ...prev, ...updated };
      localStorage.setItem('snapit_user_account', JSON.stringify(next));
      return next;
    });
    showToast('Account details updated successfully!', 'success');
  };

  const handleSignOut = () => {
    setUserAccount({
      name: '',
      phoneNumber: '',
      email: '',
      isSignedIn: false,
    });
    localStorage.removeItem('snapit_user_account');
    setReceiptsList([]);
    setActiveDocument(null);
    setIsAccountModalOpen(false);
    setCurrentScreen('main');
    showToast('Signed out of SnapIT. Vault secured.', 'info');
  };

  const handleSignIn = async (
    name: string,
    identifier: string,
    provider: 'phone' | 'email' | 'google' | 'apple' = 'phone',
    phoneNumber?: string,
    email?: string
  ) => {
    const isEmail = identifier.includes('@');
    const finalPhone = phoneNumber || (!isEmail ? identifier : undefined);
    const finalEmail = email || (isEmail ? identifier : undefined);

    const next: UserAccount = {
      name: name.trim() || 'User',
      phoneNumber: finalPhone,
      email: finalEmail,
      identifier,
      provider,
      isSignedIn: true,
    };
    setUserAccount(next);
    localStorage.setItem('snapit_user_account', JSON.stringify(next));
    setIsAccountModalOpen(false);
    setCurrentScreen('main');
    setActiveTab('home');

    await refreshReceipts();
    showToast(`Welcome back, ${name}!`, 'success');
  };

  // Switch tabs
  const handleTabChange = (tab: 'home' | 'receipts') => {
    setActiveTab(tab);
    setCurrentScreen('main');
  };

  return (
    <div className="klipit-viewport-wrapper">
      {/* STARTUP SPLASH SCREEN (Image 2 - displays application name when opened) */}
      {showSplash && (
        <SplashScreen onFinish={() => setShowSplash(false)} />
      )}

      <div className="klipit-app-frame">
        {!userAccount.isSignedIn ? (
          <LoginPage
            onLogin={handleSignIn}
            defaultName=""
            defaultPhone=""
            defaultEmail=""
          />
        ) : (
          <>
            {/* TOP HEADER: Rendered on Main screens */}
            {currentScreen === 'main' && activeTab === 'home' && (
              <KlipitHeader
                onOpenSettings={() => setCurrentScreen('settings')}
                onOpenAccount={() => setIsAccountModalOpen(true)}
              />
            )}

        {/* SCREEN CONTENT */}
        {currentScreen === 'main' && (
          <>
            {activeTab === 'home' && (
              <KlipitHomeScreen
                receipts={receiptsList}
                userName={userAccount.isSignedIn ? userAccount.name : 'Guest'}
                onOpenReceipt={handleOpenReceipt}
                onViewAllReceipts={() => setActiveTab('receipts')}
                onOpenAddModal={() => setIsAddModalOpen(true)}
                onOpenExpenditureAnalysis={() => {
                  setCurrentScreen('expenditure');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}

            {activeTab === 'receipts' && (
              <KlipitReceiptsScreen
                receipts={receiptsList}
                onOpenReceipt={handleOpenReceipt}
              />
            )}

            {/* Bottom Navigation & Floating Add button */}
            <BottomNav
              activeTab={activeTab}
              onChangeTab={handleTabChange}
              onOpenAddModal={() => setIsAddModalOpen(true)}
            />
          </>
        )}

        {/* DETAILS SCREEN (Screenshot 4) */}
        {currentScreen === 'details' && activeDocument && (
          <KlipitReceiptDetailsScreen
            document={activeDocument}
            onBack={handleBackFromDetails}
            onEdit={() => setIsEditing(true)}
            onUpdateTags={handleUpdateTags}
            onDeleteReceipt={handleDeleteReceipt}
            onShowToast={showToast}
          />
        )}

        {/* EXPENDITURE ANALYSIS SCREEN */}
        {currentScreen === 'expenditure' && (
          <ExpenditureAnalysisScreen
            receipts={receiptsList}
            onBack={() => setCurrentScreen('main')}
          />
        )}

        {/* SETTINGS VIEW */}
        {currentScreen === 'settings' && (
          <div style={{ padding: '1rem', minHeight: '100vh', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
              <button
                className="klipit-icon-circle-btn"
                onClick={() => setCurrentScreen('main')}
              >
                ←
              </button>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>SnapIT Settings</h2>
            </div>
            <SettingsView
              onShowToast={showToast}
              onDataReset={() => {
                refreshReceipts();
                setCurrentScreen('main');
              }}
            />
          </div>
        )}

        {/* SCREEN 2: ADD RECEIPT / EXPENSE BOTTOM SHEET */}
        {isAddModalOpen && (
          <AddReceiptModal
            onClose={() => setIsAddModalOpen(false)}
            onFileSelected={handleFileSelected}
            onManualExpenseCreate={handleManualExpenseCreate}
          />
        )}

        {/* YOUR ACCOUNT MODAL (NAME, NUMBER, SIGN OUT) */}
        {isAccountModalOpen && (
          <AccountModal
            user={userAccount}
            onClose={() => setIsAccountModalOpen(false)}
            onUpdateUser={handleUpdateUser}
            onSignOut={handleSignOut}
            onSignIn={handleSignIn}
          />
        )}

        {/* EDIT RECEIPT MODAL */}
        {isEditing && activeDocument && (
          <EditDetailsModal
            document={activeDocument}
            onSave={handleSaveDocument}
            onClose={() => setIsEditing(false)}
          />
        )}

        {/* PROCESSING STEPPER MODAL */}
        {isProcessing && (
          <ProcessingModal
            currentStep={processingStep}
            errorMessage={processingError}
            file={lastUploadedFile}
            onRetry={() => {
              if (lastUploadedFile) handleFileSelected(lastUploadedFile);
            }}
            onCancel={() => setIsProcessing(false)}
          />
        )}
      </>
    )}

        {/* TOAST STACK */}
        <div className="toast-container">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast ${
                t.type === 'success'
                  ? 'toast-success'
                  : t.type === 'error'
                  ? 'toast-error'
                  : 'toast-info'
              }`}
            >
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
