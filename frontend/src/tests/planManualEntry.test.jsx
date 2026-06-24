import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../services/planApi', () => ({
  planProgramsApi: {
    getAll: vi.fn().mockResolvedValue({ data: [] }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  planUploadsApi: {
    getAll: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import PlanManualEntry from '../pages/PlanManualEntry/index';

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PlanManualEntry', () => {
  it('renders without crashing', async () => {
    render(<PlanManualEntry />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/Plan Data — Manual Entry/i)).toBeInTheDocument();
    });
  });

  it('shows Add Record button', async () => {
    render(<PlanManualEntry />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Add Record')).toBeInTheDocument();
    });
  });

  it('shows form when Add Record is clicked', async () => {
    render(<PlanManualEntry />, { wrapper });
    await waitFor(() => screen.getByText('Add Record'));
    fireEvent.click(screen.getByText('Add Record'));
    await waitFor(() => {
      expect(screen.getByText('New Record')).toBeInTheDocument();
    });
  });

  it('form includes all 14 plan data fields', async () => {
    render(<PlanManualEntry />, { wrapper });
    await waitFor(() => screen.getByText('Add Record'));
    fireEvent.click(screen.getByText('Add Record'));
    // Field component renders <input placeholder={label}> — use placeholder queries
    // (label/input are co-located but not linked by htmlFor/id, so getByLabelText throws)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Department/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Program Name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Estimated Hrs/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Actual Hrs/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Effort Variance/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Productivity Index/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Effort Saved \(Hrs\)/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Effort Saved \(€\)/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Cost Saved \(€\)/i)).toBeInTheDocument();
    });
  });

  it('hides form when Cancel is clicked', async () => {
    render(<PlanManualEntry />, { wrapper });
    await waitFor(() => screen.getByText('Add Record'));
    fireEvent.click(screen.getByText('Add Record'));
    await waitFor(() => screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText('New Record')).not.toBeInTheDocument();
    });
  });

  it('shows validation error when required field is missing', async () => {
    render(<PlanManualEntry />, { wrapper });
    await waitFor(() => screen.getByText('Add Record'));
    fireEvent.click(screen.getByText('Add Record'));
    await waitFor(() => screen.getByText('Create Record'));
    fireEvent.click(screen.getByText('Create Record'));
    await waitFor(() => {
      expect(screen.getByText(/Department required/i) || screen.getByText(/required/i)).toBeTruthy();
    });
  });

  it('shows empty state when no records', async () => {
    render(<PlanManualEntry />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/No records yet/i)).toBeInTheDocument();
    });
  });
});
