import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Lock,
  Play,
  Download,
  ZoomIn,
  Layers,
  Users,
  MessageSquare,
  Trophy,
  FileType,
  Smartphone,
  Monitor,
  Shield,
  Rocket,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const premiumFeatures = [
  {
    category: 'Visualizations',
    icon: Play,
    features: [
      {
        name: 'Time-lapse Animation (Gource)',
        description:
          'Watch your project evolution with animated commit history visualization',
        icon: Play,
        badge: 'Premium',
      },
      {
        name: 'Export Visualizations',
        description:
          'Export charts, graphs, and reports in PNG, SVG, or PDF formats',
        icon: Download,
        badge: 'Premium',
      },
      {
        name: 'Advanced Zoom & Pan',
        description:
          'Interactive navigation with smooth zooming and panning controls',
        icon: ZoomIn,
        badge: 'Premium',
      },
    ],
  },
  {
    category: 'Analysis Tools',
    icon: Layers,
    features: [
      {
        name: 'UML Diagram Generation',
        description:
          'Automatically generate UML diagrams from your codebase using PlantUML',
        icon: FileType,
        badge: 'Premium',
      },
      {
        name: 'Project Efficiency Analysis',
        description:
          'Get insights on how to complete projects faster and more efficiently',
        icon: Rocket,
        badge: 'Premium',
      },
      {
        name: 'Security Insights',
        description:
          'Advanced vulnerability detection and security recommendations',
        icon: Shield,
        badge: 'Premium',
      },
    ],
  },
  {
    category: 'Multi-Project Management',
    icon: Layers,
    features: [
      {
        name: 'Manage Multiple Repositories',
        description:
          'Analyze and track multiple projects simultaneously with unified dashboard',
        icon: Layers,
        badge: 'Team',
      },
      {
        name: 'Team Collaboration',
        description:
          'Share insights, add team members, and collaborate with built-in chat',
        icon: Users,
        badge: 'Team',
      },
      {
        name: 'Team Chat Rooms',
        description:
          'Real-time communication with push notifications and email alerts',
        icon: MessageSquare,
        badge: 'Team',
      },
      {
        name: 'Gamification System',
        description:
          'Track levels, ranks, and achievements to motivate your team',
        icon: Trophy,
        badge: 'Team',
      },
    ],
  },
  {
    category: 'Desktop & Mobile',
    icon: Monitor,
    features: [
      {
        name: 'Desktop Application',
        description:
          'Download GitRay as a standalone executable with offline AI capabilities',
        icon: Monitor,
        badge: 'Enterprise',
      },
      {
        name: 'Progressive Web App (PWA)',
        description:
          'Install GitRay on Android devices with native app experience',
        icon: Smartphone,
        badge: 'Premium',
      },
    ],
  },
];

const pricingPlans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for individuals and small projects',
    features: [
      'Up to 3 repositories',
      'Basic analytics & visualizations',
      '7-day data retention',
      'Community support',
    ],
    cta: 'Current Plan',
    highlighted: false,
  },
  {
    name: 'Premium',
    price: '$15',
    period: 'per month',
    description: 'Advanced features for serious developers',
    features: [
      'Unlimited repositories',
      'All visualizations & exports',
      '30-day data retention',
      'AI-powered insights',
      'Priority support',
      'Zoom & Pan controls',
    ],
    cta: 'Upgrade to Premium',
    highlighted: true,
  },
  {
    name: 'Team',
    price: '$49',
    period: 'per month',
    description: 'Collaborate with your entire team',
    features: [
      'Everything in Premium',
      'Multi-project management',
      'Team collaboration tools',
      'Real-time team chat',
      'Gamification system',
      '90-day data retention',
      'Up to 10 team members',
    ],
    cta: 'Start Team Trial',
    highlighted: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'contact us',
    description: 'For large organizations with specific needs',
    features: [
      'Everything in Team',
      'Unlimited team members',
      'Desktop application',
      'Offline AI capabilities',
      'Custom integrations',
      'Dedicated support',
      'SLA guarantees',
      'On-premise deployment',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

interface PremiumFeaturesProps {
  showPricingOnly?: boolean;
}

export function PremiumFeatures({
  showPricingOnly = false,
}: PremiumFeaturesProps) {
  if (showPricingOnly) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {pricingPlans.map((plan, index) => (
            <Card
              key={index}
              className={`relative ${
                plan.highlighted ? 'border-primary shadow-lg scale-105' : ''
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary">Most Popular</Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <div className="mt-4">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground text-sm">
                    {plan.price !== 'Custom' && `/${plan.period}`}
                  </span>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature, featureIndex) => (
                    <li
                      key={featureIndex}
                      className="flex items-start gap-2 text-sm"
                    >
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={plan.highlighted ? 'default' : 'outline'}
                  disabled={plan.name === 'Free'}
                >
                  {plan.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Compare All Plans</CardTitle>
            <CardDescription>
              Choose the plan that best fits your needs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold">Feature</th>
                    {pricingPlans.map((plan, index) => (
                      <th key={index} className="p-3 font-semibold">
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-3">Repositories</td>
                    <td className="p-3 text-center">Up to 3</td>
                    <td className="p-3 text-center">Unlimited</td>
                    <td className="p-3 text-center">Unlimited</td>
                    <td className="p-3 text-center">Unlimited</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3">Data Retention</td>
                    <td className="p-3 text-center">7 days</td>
                    <td className="p-3 text-center">30 days</td>
                    <td className="p-3 text-center">90 days</td>
                    <td className="p-3 text-center">Unlimited</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3">AI Insights</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-center">✓</td>
                    <td className="p-3 text-center">✓</td>
                    <td className="p-3 text-center">✓ + Offline</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3">Team Collaboration</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-center">✓</td>
                    <td className="p-3 text-center">✓</td>
                  </tr>
                  <tr>
                    <td className="p-3">Desktop App</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-center">✓</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="features" className="space-y-6">
        <TabsList>
          <TabsTrigger value="features">Premium Features</TabsTrigger>
        </TabsList>

        <TabsContent value="features" className="space-y-6">
          {premiumFeatures.map((category, categoryIndex) => {
            const CategoryIcon = category.icon;
            return (
              <Card key={categoryIndex}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CategoryIcon className="h-5 w-5" />
                    {category.category}
                  </CardTitle>
                  <CardDescription>
                    Unlock powerful tools to supercharge your workflow
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {category.features.map((feature, featureIndex) => {
                      const FeatureIcon = feature.icon;
                      return (
                        <div
                          key={featureIndex}
                          className="relative overflow-hidden rounded-lg border p-4 hover:shadow-lg transition-all group"
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="relative space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="p-2 rounded-lg bg-primary/10">
                                <FeatureIcon className="h-5 w-5 text-primary" />
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {feature.badge}
                              </Badge>
                            </div>
                            <div>
                              <h4 className="font-semibold mb-1">
                                {feature.name}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {feature.description}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full"
                            >
                              Learn More
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-secondary/5">
            <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
              <Lock className="h-12 w-12 text-primary" />
              <div className="text-center space-y-2">
                <h3 className="text-xl">Unlock All Premium Features</h3>
                <p className="text-muted-foreground max-w-lg">
                  Get access to advanced visualizations, AI insights, team
                  collaboration tools, and much more with a Premium
                  subscription.
                </p>
              </div>
              <div className="flex gap-3">
                <Button size="lg">Start Free Trial</Button>
                <Button size="lg" variant="outline">
                  View Pricing
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                14-day free trial · No credit card required
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
