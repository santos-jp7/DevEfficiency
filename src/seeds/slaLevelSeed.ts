import SlaLevel from '../models/SlaLevel'

const DEFAULT_LEVELS = [
    { name: 'Dúvidas / Soluções Simples', category: 'Dúvidas',    response_hours: 4,  solution_hours: 24  },
    { name: 'Alterações Simples',          category: 'Alterações', response_hours: 4,  solution_hours: 120 },
    { name: 'Alterações Médias',           category: 'Alterações', response_hours: 4,  solution_hours: 360 },
    { name: 'Alterações Avançadas',        category: 'Alterações', response_hours: 4,  solution_hours: 720 },
    { name: 'Crítico',                     category: 'Crítico',    response_hours: 2,  solution_hours: 8   },
]

async function seedSlaLevels(): Promise<void> {
    const count = await SlaLevel.count()
    if (count === 0) {
        await SlaLevel.bulkCreate(DEFAULT_LEVELS)
    }
}

export default seedSlaLevels
