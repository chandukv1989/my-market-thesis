/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { EvidenceModal } from './components/common/EvidenceModal';
import { DashboardView } from './components/DashboardView';
import { DiscoverView } from './components/DiscoverView';
import { StockDeepDiveView } from './components/StockDeepDiveView';
import { PortfolioView } from './components/PortfolioView';
import { StrategiesView } from './components/StrategiesView';
import { BacktestingView } from './components/BacktestingView';
import { WatchlistView } from './components/WatchlistView';
import { AlertsView } from './components/AlertsView';
import { ResearchWorkspaceView } from './components/ResearchWorkspaceView';
import { InvestmentMonitorView } from './components/monitor/InvestmentMonitorView';
import { CommandCenterView } from './components/CommandCenterView';
import { CrossInvestmentView } from './components/CrossInvestmentView';
import { PortfolioScenarioView } from './components/scenarios/PortfolioScenarioView';
import { CounterfactualDecisionView } from './components/decision/CounterfactualDecisionView';
import { ResearchMemoryView } from './components/memory/ResearchMemoryView';
import { ResearchInvestigationView } from './components/investigation/ResearchInvestigationView';
import { EvidenceCollectionView } from './components/evidence/EvidenceCollectionView';
import { PilotReadinessView } from './components/pilot/PilotReadinessView';

function TerminalShell() {
  const {
    securitiesList,
    portfolio,
    watchlist,
    toggleWatchlist,
    removeFromWatchlist,
    alerts,
    markAllAlertsRead,
    toggleAlertRead,
    unreadAlertsCount,
    strategies,
    addStrategy,
    currentBacktest,
    selectStrategyForBacktest,
    currentScreen,
    setCurrentScreen,
    selectedTicker,
    currentStock,
    activeEvidence,
    setActiveEvidence,
    handleSelectStock,
    handleSearchSubmit,
    dataSourcesHealth,
    activeResearchContext
  } = useAppState();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#051424] text-[#d4e4fa] antialiased selection:bg-[#38bdf8]/30 selection:text-[#38bdf8]">
      {/* Primary Vertical Navigation Sidebar */}
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        unreadAlertsCount={unreadAlertsCount}
        selectedTicker={selectedTicker}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Main Terminal Frame */}
      <div className="flex flex-col flex-1 h-full overflow-hidden min-w-0">
        {/* Global Terminal Header */}
        <Header
          currentScreen={currentScreen}
          onNavigate={setCurrentScreen}
          unreadAlertsCount={unreadAlertsCount}
          onSearchSubmit={handleSearchSubmit}
          onSelectStock={handleSelectStock}
          portfolioNav={portfolio.nav}
          portfolioTodayChangePct={portfolio.todayChangePct}
          dataSourcesHealth={dataSourcesHealth}
        />

        {/* Dynamic View Canvas with custom dark scrollbar */}
        <main className="flex-1 overflow-y-auto bg-[#051424]">
          {currentScreen === 'pilot-readiness' && (
            <PilotReadinessView
              onNavigate={setCurrentScreen}
              onSelectStock={handleSelectStock}
            />
          )}

          {currentScreen === 'command-center' && (
            <CommandCenterView
              onNavigate={setCurrentScreen}
              onSelectStock={handleSelectStock}
              onOpenEvidence={setActiveEvidence}
            />
          )}

          {currentScreen === 'cross-investment' && (
            <CrossInvestmentView
              onNavigate={setCurrentScreen}
              onSelectStock={handleSelectStock}
              onOpenEvidence={setActiveEvidence}
            />
          )}

          {currentScreen === 'scenario-intelligence' && (
            <PortfolioScenarioView
              onNavigate={setCurrentScreen}
              onSelectStock={handleSelectStock}
              onOpenEvidence={setActiveEvidence}
            />
          )}

          {currentScreen === 'counterfactual-intelligence' && (
            <CounterfactualDecisionView
              onNavigate={setCurrentScreen}
              onSelectStock={handleSelectStock}
              onOpenEvidence={setActiveEvidence}
            />
          )}

          {currentScreen === 'research-memory' && (
            <ResearchMemoryView
              initialSecurityId={currentStock?.ticker}
              onNavigate={setCurrentScreen}
              onSelectStock={handleSelectStock}
              onOpenEvidence={setActiveEvidence}
            />
          )}

          {currentScreen === 'investigation-planning' && (
            <ResearchInvestigationView
              initialSecurityId={currentStock?.ticker}
              onNavigate={setCurrentScreen}
              onSelectStock={handleSelectStock}
              onOpenEvidence={setActiveEvidence}
            />
          )}

          {currentScreen === 'evidence-ledger' && (
            <EvidenceCollectionView
              initialSecurityId={currentStock?.ticker}
              onNavigate={setCurrentScreen}
              onSelectStock={handleSelectStock}
              onOpenEvidence={setActiveEvidence}
            />
          )}

          {currentScreen === 'dashboard' && (
            <DashboardView
              portfolio={portfolio}
              stocks={securitiesList}
              alerts={alerts}
              onSelectStock={handleSelectStock}
              onNavigate={setCurrentScreen}
              onOpenEvidence={setActiveEvidence}
            />
          )}

          {currentScreen === 'discover' && (
            <DiscoverView
              stocks={securitiesList}
              watchlistTickers={watchlist}
              onToggleWatchlist={toggleWatchlist}
              onSelectStock={handleSelectStock}
              onNavigate={setCurrentScreen}
            />
          )}

          {currentScreen === 'deep-dive' && (
            <StockDeepDiveView
              stock={currentStock}
              portfolio={portfolio}
              isWatchlisted={watchlist.includes(currentStock.ticker)}
              onToggleWatchlist={toggleWatchlist}
              onOpenEvidence={setActiveEvidence}
              allStocks={securitiesList}
              onSelectTicker={handleSelectStock}
            />
          )}

          {currentScreen === 'portfolio' && (
            <PortfolioView
              portfolio={portfolio}
              onSelectStock={handleSelectStock}
              onNavigate={setCurrentScreen}
            />
          )}

          {currentScreen === 'strategies' && (
            <StrategiesView
              strategies={strategies}
              onSelectStrategyForBacktest={strat => {
                selectStrategyForBacktest(strat);
                setCurrentScreen('backtesting');
              }}
              onNavigate={setCurrentScreen}
              onAddNewStrategy={addStrategy}
            />
          )}

          {currentScreen === 'backtesting' && (
            <BacktestingView
              currentBacktest={currentBacktest}
              strategies={strategies}
              onSelectStrategy={selectStrategyForBacktest}
              onNavigate={setCurrentScreen}
              onSelectStock={handleSelectStock}
            />
          )}

          {currentScreen === 'watchlist' && (
            <WatchlistView
              stocks={securitiesList}
              watchlistTickers={watchlist}
              onRemoveFromWatchlist={removeFromWatchlist}
              onSelectStock={handleSelectStock}
              onNavigate={setCurrentScreen}
            />
          )}

          {currentScreen === 'alerts' && (
            <AlertsView
              alerts={alerts}
              onMarkAllRead={markAllAlertsRead}
              onToggleRead={toggleAlertRead}
              onSelectStock={handleSelectStock}
              onOpenEvidence={setActiveEvidence}
              onNavigate={setCurrentScreen}
            />
          )}

          {currentScreen === 'research' && (
            <ResearchWorkspaceView
              onOpenEvidence={setActiveEvidence}
              onSelectStock={handleSelectStock}
              stocks={securitiesList}
              activeResearchContext={activeResearchContext}
              portfolio={portfolio}
            />
          )}

          {currentScreen === 'monitor' && (
            <InvestmentMonitorView
              onSelectStock={handleSelectStock}
              onOpenEvidence={setActiveEvidence}
              allStocks={securitiesList}
              portfolio={portfolio}
            />
          )}
        </main>
      </div>

      {/* Primary Source Grounding / Evidence Inspection Modal */}
      <EvidenceModal
        evidence={activeEvidence}
        onClose={() => setActiveEvidence(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <TerminalShell />
    </AppStateProvider>
  );
}
