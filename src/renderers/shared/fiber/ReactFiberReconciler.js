/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactFiberReconciler
 * @flow
 */

'use strict';

import type { Fiber } from 'ReactFiber';
import type { FiberRoot } from 'ReactFiberRoot';
import type { PriorityLevel } from 'ReactPriorityLevel';
import type { ReactNodeList } from 'ReactTypes';

var {
  addTopLevelUpdate,
} = require('ReactFiberUpdateQueue');

var {
  findCurrentUnmaskedContext,
  isContextProvider,
  processChildContext,
} = require('ReactFiberContext');
var { createFiberRoot } = require('ReactFiberRoot');
var ReactFiberScheduler = require('ReactFiberScheduler');

if (__DEV__) {
  var warning = require('warning');
  var ReactFiberInstrumentation = require('ReactFiberInstrumentation');
}

var { findCurrentHostFiber } = require('ReactFiberTreeReflection');

var getContextForSubtree = require('getContextForSubtree');

export type Deadline = {
  timeRemaining : () => number
};

type OpaqueHandle = Fiber;
type OpaqueRoot = FiberRoot;

export type HostConfig<
  Type,
  Props,
  Instance,
  TextInstance,
  PublicInstance,
  Container,
  HostContext,
  Payload,
> = {

  // this appears to be the thing we're rendering "into"- whether that's a 
  // root DOM element or something else.
  getRootHostContext(
    rootContainerInstance : Container
  ): HostContext,

  getChildHostContext(
    parentHostContext     : HostContext,
    type                  : Type
  ): HostContext,

  getPublicInstance(
    instance              : Instance | TextInstance
  ): PublicInstance,

  createInstance(
    type                  : Type,
    props                 : Props,
    rootContainerInstance : Container,
    hostContext           : HostContext,
    internalInstanceHandle: OpaqueHandle
  ) : Instance,

  appendInitialChild(
    parentInstance        : Instance,
    child                 : Instance | TextInstance
  ): void,

  finalizeInitialChildren(
    parentInstance        : Instance,
    type                  : Type,
    props                 : Props,
    rootContainerInstance : Container
  ): boolean,

  prepareUpdate(
    instance              : Instance,
    type                  : Type,
    oldProps              : Props,
    newProps              : Props,
    rootContainerInstance : Container,
    hostContext           : HostContext
  ): null | Payload,

  commitUpdate(
    instance              : Instance,
    updatePayload         : Payload,
    type                  : Type,
    oldProps              : Props,
    newProps              : Props,

    internalInstanceHandle: OpaqueHandle
  ): void,

  commitMount(
    instance              : Instance,
    type                  : Type,
    newProps              : Props,
    internalInstanceHandle: OpaqueHandle) : void,

  shouldSetTextContent(
    props                 : Props
  ) : boolean,

  resetTextContent(
    instance              : Instance
  ) : void,

  createTextInstance(
    text                  : string,
    rootContainerInstance : Container,
    hostContext           : HostContext,
    internalInstanceHandle: OpaqueHandle
  ) : TextInstance,

  commitTextUpdate(
    textInstance          : TextInstance,
    oldText               : string,
    newText               : string
  ) : void,

  appendChild(
    parentInstance        : Instance | Container,
    child                 : Instance | TextInstance
  ) : void,

  insertBefore(
    parentInstance        : Instance | Container,
    child                 : Instance | TextInstance,
    beforeChild           : Instance | TextInstance
  ) : void,

  removeChild(
    parentInstance        : Instance | Container,
    child                 : Instance | TextInstance
  ) : void,

  scheduleAnimationCallback(
    callback              : () => void
  ) : number | void,

  scheduleDeferredCallback(
    callback              : (deadline : Deadline) => void
  ) : number | void,

  prepareForCommit(
  ) : void,

  resetAfterCommit(
  ) : void,

  useSyncScheduling ?: boolean,
};

export type Reconciler<
  Container,
  Instance,
  TextInstance
> = {
  createContainer(
    containerInfo   : Container
  ) : OpaqueRoot,

  updateContainer(
    element         : ReactNodeList,
    container       : OpaqueRoot,
    parentComponent : ?ReactComponent<any, any, any>
  ) : void,

  performWithPriority(
    priorityLevel   : PriorityLevel,
    fn              : Function
  ) : void,

  batchedUpdates<A>   (fn: () => A): A,
  unbatchedUpdates<A> (fn: () => A): A,
  syncUpdates<A>      (fn: () => A): A,
  deferredUpdates<A>  (fn: () => A): A,

  getPublicRootInstance(
    container : OpaqueRoot
  ) : (ReactComponent<any, any, any> | TextInstance | Instance | null),

  findHostInstance(
    component : Fiber
  ) : Instance | TextInstance | null,
};

getContextForSubtree._injectFiber(function(fiber : Fiber) {
  const parentContext = findCurrentUnmaskedContext(fiber);
  return isContextProvider(fiber) ?
    processChildContext(fiber, parentContext, false) :
    parentContext;
});

module.exports = function<
  Type,
  Props,
  Instance,
  TextInstance,
  PublicInstance,
  Container,
  HostContext,
  Payload,
>(
  config: HostConfig<
            Type,
            Props,
            Instance,
            TextInstance,
            PublicInstance,
            Container,
            HostContext,
            Payload,
           >
): Reconciler<
   Container,
   Instance,
   TextInstance
 > {

  const {
    scheduleUpdate,
    getPriorityContext,
    performWithPriority,
    batchedUpdates,
    unbatchedUpdates,
    syncUpdates,
    deferredUpdates,
  } = ReactFiberScheduler(config);

  return {
    createContainer(
      containerInfo : Container
    ) : OpaqueRoot {
      return createFiberRoot(containerInfo);
    },

    updateContainer(
      element         : ReactNodeList,
      container       : OpaqueRoot,
      parentComponent : ?ReactComponent<any, any, any>,
      callback        : ?Function
    ) : void {

      if (container.context === null) {
        container.context         = getContextForSubtree(parentComponent);
      } else {
        container.pendingContext  = getContextForSubtree(parentComponent);
      }

      const priorityLevel = getPriorityContext();

      addTopLevelUpdate(
        container.current, // the container's Fiber
        { element },       // PartialState<any, any> (whatever that is)
        (callback === undefined ? null : callback),
        priorityLevel
      );

      scheduleUpdate(
        container.current, // the container's Fiber
        priorityLevel
      );
    },

    performWithPriority,

    batchedUpdates,

    unbatchedUpdates,

    syncUpdates,

    deferredUpdates,

    // Used to extract the return value from the initial render. Legacy API.
    getPublicRootInstance(
      container : OpaqueRoot
    ) : (ReactComponent<any, any, any> | Instance | TextInstance | null) {
      const containerFiber = container.current;
      if (!containerFiber.child) {
        return null;
      }
      return containerFiber.child.stateNode;
    },

    // Use for findDOMNode/findHostNode. Legacy API.
    findHostInstance(
      fiber : Fiber
    ) : Instance | TextInstance | null {
      const hostFiber = findCurrentHostFiber(fiber);
      if (hostFiber === null) {
        return null;
      }
      return hostFiber.stateNode;
    },

  };

};
