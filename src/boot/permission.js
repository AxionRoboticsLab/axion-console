import { permissionDirective } from 'src/composables/usePermission'

export default ({ app }) => {
  app.directive('permission', permissionDirective())
}
