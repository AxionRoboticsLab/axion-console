<template>
  <q-page padding>
    <div class="text-h4 q-mb-md">AXION</div>
    <div class="text-subtitle1 text-grey-7 q-mb-lg">
      Robot console · VMS · Test Center · User Center
    </div>

    <div class="row q-col-gutter-md">
      <div class="col-12 col-sm-6 col-md-3" v-for="card in cards" :key="card.to">
        <q-card clickable v-ripple @click="$router.push(card.to)">
          <q-card-section class="row items-center q-gutter-sm">
            <q-icon :name="card.icon" size="32px" color="primary" />
            <div>
              <div class="text-subtitle1">{{ $t(card.title) }}</div>
              <div class="text-caption text-grey">{{ $t(card.caption) }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
defineOptions({ name: 'IndexPage' })

const cards = [
  { title: 'robot', caption: 'robot_description', icon: 'smart_toy', to: '/robot/amr' },
  { title: 'vms', caption: 'vms_description', icon: 'inventory_2', to: '/vms/versions' },
  { title: 'test_center', caption: 'test_center_description', icon: 'verified', to: '/autotest/runs' },
  { title: 'user_center', caption: 'user_center_description', icon: 'manage_accounts', to: '/users/users' }
]
</script>
