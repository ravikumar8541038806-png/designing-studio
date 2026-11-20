import { uid } from '../lib/id'
import type { Carousel, PdfDoc, Slide } from '../types'

export const SAMPLE_SOURCE = `Photosynthesis is the process by which green plants, algae and some bacteria convert light energy into chemical energy stored in glucose. It happens mainly in the chloroplasts of leaf cells, where the pigment chlorophyll absorbs light, mostly in the blue and red parts of the visible spectrum while reflecting green.

The overall balanced equation is 6CO2 + 6H2O + light energy producing C6H12O6 + 6O2. The reaction has two linked stages. The light-dependent reactions happen in the thylakoid membranes: water is split (photolysis) to release oxygen, and the energy carriers ATP and NADPH are produced. The light-independent reactions, also called the Calvin cycle, happen in the stroma and use ATP and NADPH to fix carbon dioxide into a three-carbon sugar, which is then built into glucose.

Rate of photosynthesis is limited by light intensity, carbon dioxide concentration and temperature. At low light, increasing intensity increases the rate. Beyond a saturation point, light is no longer limiting and CO2 becomes the limiting factor. Temperature matters because the Calvin cycle depends on enzymes; the rate peaks around 25 to 35 degrees Celsius and falls sharply beyond that as enzymes denature. Water shortage causes stomata to close, which cuts CO2 intake and slows the whole process.

Exam traps: students often say plants breathe out only carbon dioxide at night. In fact respiration happens all the time, while photosynthesis happens only in light. Another common slip is confusing the site of the two stages: the light-dependent reactions occur in the thylakoid membranes, the Calvin cycle in the stroma. Write the equation with the correct coefficients, and always state that oxygen comes from water, not from carbon dioxide.

Questions frequently ask for the effect of a factor when another is limiting, or for the fate of the products of the light reactions. ATP and NADPH produced in the thylakoids are consumed in the stroma; oxygen diffuses out of the leaf or is used in respiration; glucose is stored as starch or used for growth.`

export const SAMPLE_DOC: PdfDoc = {
  title: 'Photosynthesis: The Engine of Life',
  eyebrow: 'STUDY NOTES',
  subtitle: 'Class 10 Biology · Chapter 6 · Complete revision pack',
  sections: [
    {
      id: uid('s'),
      heading: 'Why Photosynthesis Matters',
      blocks: [
        {
          id: uid('b'),
          type: 'lead',
          text: 'Every food chain on the planet starts with a leaf turning light into sugar. Understand this one process and half of the biology syllabus falls into place.',
        },
        {
          id: uid('b'),
          type: 'paragraph',
          text: 'Photosynthesis is the process by which **green plants, algae and some bacteria** convert light energy into chemical energy stored in glucose. It happens mainly in the **chloroplasts** of leaf cells, where **chlorophyll** absorbs light in the blue and red bands while reflecting green.',
        },
        {
          id: uid('b'),
          type: 'keyterms',
          items: [
            { term: 'Chlorophyll', definition: 'The green pigment that captures light energy inside the chloroplast.' },
            { term: 'Stroma', definition: 'The fluid space around the thylakoids where the Calvin cycle runs.' },
            { term: 'Photolysis', definition: 'The splitting of water by light, releasing oxygen and electrons.' },
          ],
        },
      ],
    },
    {
      id: uid('s'),
      heading: 'The Core Equation',
      blocks: [
        {
          id: uid('b'),
          type: 'paragraph',
          text: 'The balanced equation is **6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂**. Oxygen is released from **water**, not from carbon dioxide — a detail examiners test every year.',
        },
        {
          id: uid('b'),
          type: 'table',
          caption: 'Inputs, outputs and where each step happens',
          columns: ['Stage', 'Site', 'Needs', 'Produces'],
          rows: [
            ['Light-dependent reactions', 'Thylakoid membrane', 'Light, water', 'ATP, NADPH, O₂'],
            ['Calvin cycle', 'Stroma', 'ATP, NADPH, CO₂', 'Triose phosphate → glucose'],
            ['Storage', 'Leaf and stem tissue', 'Glucose', 'Starch'],
          ],
        },
        {
          id: uid('b'),
          type: 'callout',
          kind: 'fact',
          title: 'Key Fact',
          body: 'Chlorophyll reflects green light, which is why leaves look green. That reflected wavelength is the part of the spectrum plants use least.',
        },
      ],
    },
    {
      id: uid('s'),
      heading: 'Two Stages at a Glance',
      blocks: [
        {
          id: uid('b'),
          type: 'numbered',
          items: [
            'Light strikes chlorophyll in the thylakoid membrane and excites electrons.',
            'Water is split, releasing oxygen and replacing the lost electrons.',
            'ATP and NADPH are produced and pass into the stroma.',
            'CO₂ is fixed in the Calvin cycle using that ATP and NADPH.',
            'Glucose is assembled, then stored as starch or used for growth.',
          ],
        },
        {
          id: uid('b'),
          type: 'callout',
          kind: 'exam',
          title: 'Exam Important',
          body: 'Never write that the Calvin cycle needs light directly. It needs ATP and NADPH — that distinction is worth easy marks.',
        },
      ],
    },
    {
      id: uid('s'),
      heading: 'Factors That Change the Rate',
      blocks: [
        {
          id: uid('b'),
          type: 'bullets',
          items: [
            '**Light intensity** — the rate rises until a saturation point is reached.',
            '**CO₂ concentration** — usually the limiting factor once light is plentiful.',
            '**Temperature** — enzymes peak near 25–35 °C and denature beyond that.',
            '**Water supply** — shortage closes stomata and chokes CO₂ intake.',
          ],
        },
        {
          id: uid('b'),
          type: 'table',
          caption: 'Limiting factors at a glance',
          columns: ['Factor', 'Typical effect', 'Exam wording'],
          rows: [
            ['Light intensity', 'Rate rises then plateaus', 'Light is no longer limiting'],
            ['CO₂ level', 'Rate rises with concentration', 'CO₂ is the limiting factor'],
            ['Temperature', 'Peaks, then falls sharply', 'Enzymes denature above optimum'],
          ],
        },
      ],
    },
    {
      id: uid('s'),
      heading: 'Common Exam Traps',
      blocks: [
        {
          id: uid('b'),
          type: 'paragraph',
          text: 'Students often claim plants only respire at night. In reality **respiration runs continuously**, while photosynthesis runs only in light. Another frequent slip is mixing up the two sites: thylakoid membranes for the light reactions, **stroma for the Calvin cycle**.',
        },
        {
          id: uid('b'),
          type: 'quote',
          text: 'Write the equation with correct coefficients, then name the source of every product. That single habit fixes most lost marks.',
          cite: 'Marker feedback, 2025 board papers',
        },
      ],
    },
  ],
  mcqs: [
    {
      id: uid('q'),
      question: 'Where does the Calvin cycle take place?',
      options: ['Thylakoid membrane', 'Stroma of the chloroplast', 'Mitochondrial matrix', 'Cell cytoplasm'],
      answer: 'Stroma of the chloroplast',
      explanation: 'The Calvin cycle uses ATP and NADPH in the stroma, while the light reactions run in the thylakoid membranes.',
    },
    {
      id: uid('q'),
      question: 'The oxygen released during photosynthesis comes from which molecule?',
      options: ['Carbon dioxide', 'Glucose', 'Water', 'ATP'],
      answer: 'Water',
      explanation: 'Photolysis splits water into electrons, protons and oxygen.',
    },
    {
      id: uid('q'),
      question: 'Once light is abundant, which factor most often limits the rate of photosynthesis?',
      options: ['Oxygen concentration', 'Carbon dioxide concentration', 'Chlorophyll colour', 'Leaf thickness'],
      answer: 'Carbon dioxide concentration',
      explanation: 'After the light saturation point, CO₂ supply becomes the limiting factor.',
    },
  ],
}

export const SAMPLE_CAROUSEL: Carousel = {
  title: '5 Pricing Mistakes That Cost Freelancers Real Money',
  slides: [
    {
      id: uid('slide'),
      kind: 'hook',
      eyebrow: 'FREELANCE PRICING',
      headline: 'You are not charging too much. You are charging too vaguely.',
      subhook: 'Five pricing mistakes that quietly cap a freelance income — and the fix for each.',
      points: [],
      numbered: false,
      cta: '',
    },
    {
      id: uid('slide'),
      kind: 'idea',
      eyebrow: 'MISTAKE 01',
      headline: 'Quoting a single number',
      subhook: '',
      points: [
        'One price invites a yes or no',
        'Three tiers invite a choice',
        'Anchor with your best-fit package',
      ],
      numbered: true,
      cta: '',
    },
    {
      id: uid('slide'),
      kind: 'idea',
      eyebrow: 'MISTAKE 02',
      headline: 'Billing for hours, not outcomes',
      subhook: '',
      points: ['Clients buy the result', 'Hours punish you for getting faster', 'Price the deliverable, not the clock'],
      numbered: true,
      cta: '',
    },
    {
      id: uid('slide'),
      kind: 'idea',
      eyebrow: 'MISTAKE 03',
      headline: 'Free revisions, unlimited',
      subhook: '',
      points: ['Two rounds included', 'Extra rounds billed per hour', 'Put it in writing before kickoff'],
      numbered: true,
      cta: '',
    },
    {
      id: uid('slide'),
      kind: 'idea',
      eyebrow: 'MISTAKE 04',
      headline: 'Working before the deposit clears',
      subhook: 'A 40–50% upfront payment filters out clients who were never going to pay.',
      points: [],
      numbered: false,
      cta: '',
    },
    {
      id: uid('slide'),
      kind: 'idea',
      eyebrow: 'MISTAKE 05',
      headline: 'Sending full files before final payment',
      subhook: 'Send a watermarked preview for approval. Release the clean export only after payment.',
      points: [],
      numbered: false,
      cta: '',
    },
    {
      id: uid('slide'),
      kind: 'cta',
      eyebrow: 'NEXT STEP',
      headline: 'Rewrite one proposal today',
      subhook: '@yourhandle',
      points: [],
      numbered: false,
      cta: 'Save this post',
    },
  ],
}

export function emptySlide(index: number, total: number): Slide {
  const kind = index === 0 ? 'hook' : index === total - 1 ? 'cta' : 'idea'
  return {
    id: uid('slide'),
    kind,
    eyebrow: kind === 'idea' ? `IDEA ${String(index).padStart(2, '0')}` : kind === 'hook' ? 'HOOK' : 'NEXT STEP',
    headline: kind === 'hook' ? 'Your hook goes here' : kind === 'cta' ? 'Your call to action' : 'One idea per slide',
    subhook: '',
    points: [],
    numbered: false,
    cta: kind === 'cta' ? 'Save this post' : '',
  }
}
