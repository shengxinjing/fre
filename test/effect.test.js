/** @jsx h */
import { h, useLayout } from '../src/index'
import { testUpdates } from './test-util'

test('useLayout(f, [x]) should run on changes to x', async done => {
  let effects = []

  const effect = value => {
    effects.push(`effect ${value}`)

    return () => {
      effects.push(`cleanUp ${value}`)
    }
  }

  const Component = ({ value }) => {
    useLayout(() => effect(value), [value])
    effects = []

    return <div>foo</div>
  }

  await testUpdates([
    {
      content: <Component value={0} />,
      test: () => {
        expect(effects).toEqual(['effect 0'])
      }
    },
    {
      content: <Component value={1} />,
      test: () => {
        expect(effects).toEqual(['cleanUp 0', 'effect 1'])
      }
    },
    {
      content: <Component value={1} count={0} />,
      test: () => {
        expect(effects).toEqual([])
      }
    },
    {
      content: <div>removed</div>,
      test: () => {
        expect(effects).toEqual(['cleanUp 1'])
        done()
      }
    }
  ])
})

test('useEffect(f, []) should run only once', async done => {
  let effects = []

  const effect = () => {
    effects.push(`effect`)

    return () => {
      effects.push(`cleanUp`)
    }
  }

  const Component = () => {
    effects = []
    useLayout(effect, [])

    return <div>foo</div>
  }

  await testUpdates([
    {
      content: <Component />,
      test: () => {
        expect(effects).toEqual(['effect'])
      }
    },
    {
      content: <Component count={0} />,
      test: () => {
        expect(effects).toEqual([])
      }
    },
    {
      content: <div>removed</div>,
      test: () => {
        expect(effects).toEqual(['cleanUp'])
        done()
      }
    }
  ])
})

test('useLayout(f) should run every time', async done => {
  let effects = []

  const effect = value => {
    effects.push(`effect ${value}`)

    return () => {
      effects.push(`cleanUp ${value}`)
    }
  }

  const Component = ({ value }) => {
    effects = []
    useLayout(() => effect(value))

    return <div>foo</div>
  }

  await testUpdates([
    {
      content: <Component value={0} />,
      test: () => {
        expect(effects).toEqual(['effect 0'])
      }
    },
    {
      content: <Component value={1} />,
      test: () => {
        expect(effects).toEqual(['cleanUp 0', 'effect 1'])
      }
    },
    {
      content: <Component value={2} />,
      test: () => {
        expect(effects).toEqual(['cleanUp 1', 'effect 2'])
        effects = [] // next time the Component will not rerender, we need clean here
      }
    },
    {
      content: <div>removed</div>,
      test: () => {
        expect(effects).toEqual(['cleanUp 2'])
        done()
      }
    }
  ])
})
