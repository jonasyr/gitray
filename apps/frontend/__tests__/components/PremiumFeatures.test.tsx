import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { PremiumFeatures } from '../../src/components/PremiumFeatures';

describe('PremiumFeatures Component', () => {
  test('should render the premium features list by default', () => {
    // Act
    render(<PremiumFeatures />);

    // Assert
    expect(
      screen.getByRole('tab', { name: /Premium Features/i })
    ).toBeInTheDocument();

    // Check for categories
    expect(screen.getByText('Visualizations')).toBeInTheDocument();
    expect(screen.getByText('Analysis Tools')).toBeInTheDocument();
    expect(screen.getByText('Multi-Project Management')).toBeInTheDocument();
    expect(screen.getByText('Desktop & Mobile')).toBeInTheDocument();

    // Check for specific features
    expect(
      screen.getByText('Time-lapse Animation (Gource)')
    ).toBeInTheDocument();
    expect(screen.getByText('UML Diagram Generation')).toBeInTheDocument();
    expect(
      screen.getByText('Manage Multiple Repositories')
    ).toBeInTheDocument();

    // Check for CTA
    expect(screen.getByText('Unlock All Premium Features')).toBeInTheDocument();
  });

  test('should render only the pricing compare view when showPricingOnly is true', () => {
    // Act
    render(<PremiumFeatures showPricingOnly={true} />);

    // Assert
    // Check for pricing plans
    expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Premium' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Enterprise' })
    ).toBeInTheDocument();

    // Check for prices
    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('$15')).toBeInTheDocument();
    expect(screen.getByText('$49')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();

    // Check for the comparison table
    expect(screen.getByText('Compare All Plans')).toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
    expect(screen.getByText('30 days')).toBeInTheDocument();
    expect(screen.getByText('90 days')).toBeInTheDocument();

    // Ensure features list is NOT rendered
    expect(
      screen.queryByRole('tab', { name: /Premium Features/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Time-lapse Animation (Gource)')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Unlock All Premium Features')
    ).not.toBeInTheDocument();
  });
});
