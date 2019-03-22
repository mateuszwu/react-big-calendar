import PropTypes from 'prop-types';
import React from 'react';
import { findDOMNode } from 'react-dom';
import cn from 'classnames';

import Selection, { getBoundsForNode, isEvent } from './Selection';
import dates from './utils/dates';
import { isSelected } from './utils/selection';
import localizer from './localizer'

import { notify } from './utils/helpers';
import { accessor, elementType, dateFormat } from './utils/propTypes';
import { accessor as get } from './utils/accessors';

import getStyledEvents, { positionFromDate, startsBefore } from './utils/dayViewLayout'

import TimeColumn from './TimeColumn'

function snapToSlot(date, step){
  var roundTo = 1000 * 60 * step;
  return new Date(Math.floor(date.getTime() / roundTo) * roundTo)
}

function startsAfter(date, max) {
  return dates.gt(dates.merge(max, date), max, 'minutes')
}

class DayColumn extends React.Component {
  static propTypes = {
    allDayOpen: PropTypes.bool,
    openHours: PropTypes.object,

    events: PropTypes.array.isRequired,
    step: PropTypes.number.isRequired,
    min: PropTypes.instanceOf(Date).isRequired,
    max: PropTypes.instanceOf(Date).isRequired,
    now: PropTypes.instanceOf(Date),

    rtl: PropTypes.bool,
    titleAccessor: accessor,
    allDayAccessor: accessor.isRequired,
    startAccessor: accessor.isRequired,
    endAccessor: accessor.isRequired,

    selectRangeFormat: dateFormat,
    eventTimeRangeFormat: dateFormat,
    eventTimeRangeStartFormat: dateFormat,
    eventTimeRangeEndFormat: dateFormat,
    showMultiDayTimes: PropTypes.bool,
    culture: PropTypes.string,
    timeslots: PropTypes.number,
    messages: PropTypes.object,

    selected: PropTypes.object,
    selectable: PropTypes.oneOf([true, false, 'ignoreEvents']),
    eventOffset: PropTypes.number,
    longPressThreshold: PropTypes.number,

    onSelecting: PropTypes.func,
    onSelectSlot: PropTypes.func.isRequired,
    onSelectEvent: PropTypes.func.isRequired,
    onDoubleClickEvent: PropTypes.func.isRequired,

    className: PropTypes.string,
    dragThroughEvents: PropTypes.bool,
    eventPropGetter: PropTypes.func,
    dayWrapperComponent: elementType,
    eventComponent: elementType,
    eventWrapperComponent: elementType.isRequired,
  };

  static defaultProps = {
    dragThroughEvents: true,
    timeslots: 2,
  };

  state = { selecting: false };

  componentDidMount() {
    this.props.selectable
    && this._selectable()
  }

  componentWillUnmount() {
    this._teardownSelectable();
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.selectable && !this.props.selectable)
      this._selectable();
    if (!nextProps.selectable && this.props.selectable)
      this._teardownSelectable();
  }

  render() {
    const {
      allDayOpen,
      min,
      max,
      step,
      now,
      selectRangeFormat,
      culture,
      openHours,
      ...props
    } = this.props

    this._totalMin = dates.diff(min, max, 'minutes')
    let { selecting, startSlot, endSlot } = this.state
    let style = this._slotStyle(startSlot, endSlot)

    let start = this.state.startDate
    let end = this.state.endDate

    if(allDayOpen === false && openHours && start && end) {
      if (start.getHours() === openHours.start.hour && start.getMinutes() < openHours.start.minute) {
        if (end.getHours() === openHours.start.hour && end.getMinutes() < openHours.start.minute) {
          end.setHours(openHours.start.hour)
          end.setMinutes(openHours.start.minute)
        }

        start.setMinutes(openHours.start.minute)
      }

      if (end.getHours() > openHours.end.hour) {
        end.setHours(openHours.end.hour)
        end.setMinutes(openHours.end.minute)
      } else if (end.getHours() === openHours.end.hour && end.getMinutes() > openHours.end.minute) {
        end.setMinutes(openHours.end.minute)
      }

      if (end < start) {
        start = new Date(end)
      }

      if(end.getHours() === 23 && end.getMinutes() === 59 && end.getSeconds() === 59) {
        end.setSeconds(end.getSeconds() + 1);
      }
    }

    return (
      <TimeColumn
        {...props}
        className={cn(
          'rbc-day-slot',
          dates.isToday(max) && 'rbc-today'
        )}
        now={now}
        min={min}
        max={max}
        step={step}
      >
        {this.renderEvents()}

        {!props.disableDragSelection && selecting &&
          <div className='rbc-slot-selection' style={style}>
              <span>
              { localizer.format({start, end}, selectRangeFormat, culture) }
              </span>
          </div>
        }
      </TimeColumn>
    );
  }

  renderEvents = () => {
    let {
        events
      , min
      , max
      , showMultiDayTimes
      , eventPropGetter
      , selected
      , eventComponent
      , eventWrapperComponent: EventWrapper
      , rtl: isRtl
      , step
      , timeslots
      , startAccessor, endAccessor, titleAccessor } = this.props;

    let EventComponent = eventComponent

    let styledEvents = getStyledEvents({
      events, startAccessor, endAccessor, min, showMultiDayTimes, totalMin: this._totalMin, step, timeslots
    })

    return styledEvents.map(({ event, style }, idx) => {
      let _continuesPrior = false;
      let _continuesAfter = false;
      let start = get(event, startAccessor)
      let end = get(event, endAccessor)

      if (start < min) {
        start = min;
        _continuesPrior = true;
      }

      if (end > max) {
        end = max;
        _continuesAfter = true;
      }

      let continuesPrior = startsBefore(start, min)
      let continuesAfter = startsAfter(end, max)

      let title = get(event, titleAccessor)

      let _isSelected = isSelected(event, selected)

      if (eventPropGetter)
        var { style: xStyle, className } = eventPropGetter(event, start, end, _isSelected)

      // edited by onursimsek94
      if (event.bgColor) // added
        var bgColorStyle = {backgroundColor: event.bgColor} // added

      let { height, top, width, xOffset } = style

      return (
        <EventWrapper event={event} key={'evt_' + idx}>
          <div
            style={{
              ...xStyle,
              top: `${top}%`,
              height: `${height}%`,
              [isRtl ? 'right' : 'left']: `${Math.max(0, xOffset)}%`,
              width: `${width}%`,
              ...bgColorStyle // added
            }}
            title={title}
            onClick={(e) => this._select(event, e)}
            onDoubleClick={(e) => this._doubleClick(event, e)}
            className={cn('rbc-event', className, {
              'rbc-selected': _isSelected,
              'rbc-event-continues-earlier': continuesPrior,
              'rbc-event-continues-later': continuesAfter,
              'rbc-event-continues-day-prior': _continuesPrior,
              'rbc-event-continues-day-after': _continuesAfter
            })}
          >
            <div className='rbc-event-content'>
              { EventComponent
                ? <EventComponent event={event} title={title}/>
                : title
              }
            </div>
          </div>
        </EventWrapper>
      )
    })
  };

  _slotStyle = (startSlot, endSlot) => {
    let top = ((startSlot / this._totalMin) * 100);
    let bottom = ((endSlot / this._totalMin) * 100);

    return {
      top: top + '%',
      height: bottom - top + '%'
    }
  };

  _selectable = () => {
    let node = findDOMNode(this);
    let selector = this._selector = new Selection(()=> findDOMNode(this), {
      longPressThreshold: this.props.longPressThreshold,
    })

    let maybeSelect = (box) => {
      let onSelecting = this.props.onSelecting
      let current = this.state || {};
      let state = selectionState(box);
      let { startDate: start, endDate: end } = state;

      if (onSelecting) {
        if (
          (dates.eq(current.startDate, start, 'minutes') &&
          dates.eq(current.endDate, end, 'minutes')) ||
          onSelecting({ start, end }) === false
        )
          return
      }

      this.setState(state)
    }

    let selectionState = ({ y }) => {
      let { step, min, max } = this.props;
      let { top, bottom } = getBoundsForNode(node)

      let mins = this._totalMin;

      let range = Math.abs(top - bottom)

      let current = (y - top) / range;

      current = snapToSlot(minToDate(mins * current, min), step)

      if (!this.state.selecting)
        this._initialDateSlot = current

      let initial = this._initialDateSlot;

      if (dates.eq(initial, current, 'minutes'))
        current = dates.add(current, step, 'minutes')

      let start = dates.max(min, dates.min(initial, current))
      let end = dates.min(max, dates.max(initial, current))

      return {
        selecting: true,
        startDate: start,
        endDate: end,
        startSlot: positionFromDate(start, min, this._totalMin),
        endSlot: positionFromDate(end, min, this._totalMin)
      }
    }

    let selectorClicksHandler = (box, actionType) => {
      if (!isEvent(findDOMNode(this), box))
        this._selectSlot({ ...selectionState(box), action: actionType })

      this.setState({ selecting: false })
    }

    selector.on('selecting', maybeSelect)
    selector.on('selectStart', maybeSelect)

    selector.on('beforeSelect', (box) => {
      if (this.props.selectable !== 'ignoreEvents') return

      return !isEvent(findDOMNode(this), box)
    })

    selector
      .on('click', box => selectorClicksHandler(box, 'click'))

    selector
      .on('doubleClick', (box) => selectorClicksHandler(box, 'doubleClick'))

    selector
      .on('select', () => {
        if (this.state.selecting) {
          this._selectSlot({ ...this.state, action: 'select' })
          this.setState({ selecting: false })
        }
      })
  };

  _teardownSelectable = () => {
    if (!this._selector) return
    this._selector.teardown();
    this._selector = null;
  };

  _selectSlot = ({ startDate, endDate, action }) => {
    let current = startDate
      , slots = [];

    while (dates.lte(current, endDate)) {
      slots.push(current)
      current = dates.add(current, this.props.step, 'minutes')
    }

    notify(this.props.onSelectSlot, {
      slots,
      start: startDate,
      end: endDate,
      action
    })
  };

  _select = (...args) => {
    notify(this.props.onSelectEvent, args)
  };

  _doubleClick = (...args) => {
    notify(this.props.onDoubleClickEvent, args)
  };
}


function minToDate(min, date){
  var dt = new Date(date)
    , totalMins = dates.diff(dates.startOf(date, 'day'), date, 'minutes');

  dt = dates.hours(dt, 0);
  dt = dates.minutes(dt, totalMins + min);
  dt = dates.seconds(dt, 0)
  return dates.milliseconds(dt, 0)
}

export default DayColumn;
