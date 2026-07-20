// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IntradayBuilt } from '@kansoku/shared/types';
import { PredictionTab } from './PredictionTab';

afterEach(() => {
  cleanup();
});

const nullPredictionBuilt = {
  kind: 'intraday',
  sidebar: {
    prediction: null,
    entryPlan: null,
    technicals: {},
    context: null,
  },
  timeframes: {},
} as unknown as IntradayBuilt;

describe('PredictionTab null-prediction branch', () => {
  it('renders emptyCta below the preview-mode verdict when prediction is null', () => {
    render(
      <PredictionTab
        built={nullPredictionBuilt}
        activeTf="m5"
        emptyCta={<div data-testid="empty-cta">生成分析</div>}
      />,
    );

    expect(screen.getByText('👀 预览模式')).toBeTruthy();
    expect(screen.getByTestId('empty-cta')).toBeTruthy();
  });

  it('renders nothing extra when emptyCta is not passed', () => {
    render(<PredictionTab built={nullPredictionBuilt} activeTf="m5" />);

    expect(screen.getByText('👀 预览模式')).toBeTruthy();
    expect(screen.queryByTestId('empty-cta')).toBeNull();
  });
});
